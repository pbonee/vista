from celery import shared_task
import requests
from bs4 import BeautifulSoup
from .models import MyUser, Account, Asset, AcctHolding, News, Alert, AlertQ, MktInfo, IndexData
import os
from polygon import RESTClient
from django.utils import timezone
from datetime import datetime
from twilio.rest import Client


@shared_task(name="get_news")
def get_news():
    """
    This task goes to wallmine.com and gets latest news items per Asset.
    News headlines & links are saved to database.
    This task does not need to run frequently. Every 5 mins should be okay.
    """
    STORIES_PER_SYMBOL = 5                   # stories we'll get per asset
    BASE_URL_NEWS = "https://wallmine.com/"  # our news source
    assetsAll = Asset.objects.all()
    for a in assetsAll:
        astr = a.assetSymbol.upper()    # ticker symbol
        if astr != "CASH":              # skip if it's CASH
            News.objects.filter(symbol=a).delete()  # will overwrite old news
            wmurl = BASE_URL_NEWS + astr
            try:
                page = requests.get(wmurl, timeout=2)   # get info for this ticker
            except:
                print(f"ERROR: timeout on wallmine.com/{astr}")
            else:
                stringer = page.text  # get page as a string and parse it
                soup = BeautifulSoup(stringer, features="html.parser")
                allNewsTitles = soup.find_all(class_='news__title', limit=5)
                if not allNewsTitles:
                    print(f"ERROR: No news titles from wallmine.com/{astr}")
                else:
                    for title in allNewsTitles:
                        newsString = title.string.replace("\n", "")
                        newsLink = title.parent.get('data-href')
                        if newsLink[:4] != 'http':
                            print('ERROR: got invalid newsLink')
                            continue    # skip if don't see http in this string
                        try:    # Need to follow redirect to get real link
                            r = requests.get(newsLink, timeout=2)
                        except:
                            print('ERROR: unable to get newsLink redirect url')
                            continue    # skip if error getting news link
                        realLink = r.url  # actual target news item url
                        print(f"news headline: {newsString}")  # for debug only
                        print(f"news item url: {realLink}")    # for debug only
                        if len(newsString) > 55:    # need to limit size for scroller
                            words = newsString.split()  # split into [words]
                            newstr = ''
                            i = 0
                            while (len(newstr) < 55):
                                if i >= len(words):
                                    break
                                newstr = newstr + ' ' + words[i]
                                i += 1
                            newsString = newstr[:62] + " ..."  # shortened string
                        n = News(symbol=a, headline=newsString, articleURL=realLink)
                        n.save() # put this news item in db
    return

@shared_task(name="refresh_prices")
def refresh_prices():
    """Periodic task to update stock prices in database in background."""
    STOCKS_PER_PASS = 5     # number of tickers to handle each time through here

    key = os.getenv("APCA_API_KEY_ID")
    with RESTClient(key) as client:
        assetsall = Asset.objects.order_by('-lastLook')[:STOCKS_PER_PASS]
        for a in assetsall:
            astr = a.assetSymbol.upper()
            if astr != "CASH":
                resp = client.stocks_equities_previous_close(astr)
                prevclose = resp.results[0]['c']
                resp = client.stocks_equities_last_trade_for_a_symbol(astr)
                lastprice = resp.last.price
                print(f"{astr}, status={resp.status} prevclose={prevclose}, lasttrade={lastprice}")
                if resp.status == 'success':
                    a.lastPrice = lastprice
                    a.openingPrice = prevclose
                    a.lastLook = timezone.localtime()
                    a.save()
                else:
                    print(f"unable to update {astr}")
    print(f"refresh_prices processed {len(assetsall)} price updates")
    return

@shared_task(name="alerts_task")
def alerts_task():
    """Periodic task to check for, and send out, any user-defined alerts"""
    # Check database to see if any alerts should be triggered
    alrts = Alert.objects.all()
    for alrt in alrts:
        stock = Asset.objects.filter(assetSymbol=alrt.symbol).first()
        if alrt.movement == 'goes above':   # if there is a go-above alert set
            if alrt.lastLook <= alrt.threshold:  # if last time we were below threshold
                if stock.lastPrice > alrt.threshold: # are we now above threshold?
                    sendAlert(alrt)              # Send alert!
        elif alrt.movement == 'goes below':  # if there is a go-below alert set:
            if alrt.lastLook >= alrt.threshold:  # if last time we were above threshold
                if stock.lastPrice < alrt.threshold: # are we now below threshold?
                    sendAlert(alrt)              # Send alert!
        alrt.lastLook = stock.lastPrice     # in any case, update lastLook to current price
        alrt.save()
    return

#  This func takes alert object and sends out appropriate alert
def sendAlert(alrt):
    print('')
    if alrt.movement == 'goes above':
        say = "crossed above"
    elif alrt.movement == 'goes below':
        say = "crossed below"
    else:
        say = alrt.movement
    txtmsg = f"ALERT: {alrt.symbol} {say} {alrt.threshold} at {timezone.localtime().strftime('%m/%d %H:%M')}"
    print(txtmsg)
    print('')
    cm = AlertQ(user=alrt.user, alertmessage=txtmsg)
    cm.save()    # put in queue to go out to client on next get_portfolio
    if alrt.text_notification:
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        twilio_number = os.getenv("TWILIO_PHONE_NUMBER")
        # make sure we have Twilio account credentials
        if ((account_sid is not None) and (auth_token is not None) and (twilio_number is not None)):
            ph = alrt.user.mobile_number
            print(f"We got to text notif. and the user's phone no. is: {alrt.user.mobile_number}")
            print(f"the user is: {alrt.user}")
            print(f"user's phone number is: {alrt.user.mobile_number}")
            if ph[0:2] != "+1": # if no +1 in front of mobile number add it
                ph = '+1' + ph
            if len(ph) == 12:      # only proceed if we have 12 character US phone number
                client = Client(account_sid, auth_token)
                message = client.messages \
                                .create(
                                     body=txtmsg,
                                     from_=twilio_number,
                                     to=ph
                                 )
                print(message.sid)
            else:
                print("Failed to send sms alert. not a 12 char US number.")
        else:
            print("Failed to send sms alert. No Twilio credentials.")
    return

@shared_task(name="stat_update")
def stat_update():
    """Task to check market status from polygon.io"""
    key = os.getenv("APCA_API_KEY_ID")
    with RESTClient(key) as client:
        resp = client.reference_market_status()
    d = datetime.fromisoformat(resp.serverTime) # convert polygon's ISO format to Python time
    dstring = d.strftime('%m/%d %H:%M')         # and create a string version (in NY time)
    mktstatus = resp.market
    print(f"stat_update task: at {dstring} NY time the status is {mktstatus}")
    MktInfo.objects.all().delete()              # get rid of previous db table entry
    m = MktInfo(mktStatus=mktstatus, lastCheckTimeNY=d)
    m.save()                                    # and create new db entry - current time and status



@shared_task(name="heartbeat")
def heartbeat():
    """This was used for debug only"""
    print("BEAT")
    return
