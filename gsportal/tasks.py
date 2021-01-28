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
    """Task to get latest time and market status. Run this every 5 seconds."""
    d = timezone.localtime()                # NY time in Python format
    if MktInfo.objects.first() is not None:     # make sure there exists an object in table
        if (((d.minute == 0) or (d.minute == 30)) and d.second < 15):  # at possible mkt status boundary?
            # We have limited quota with polygon, so want to minimize how frequently we check!
            key = os.getenv("APCA_API_KEY_ID")  # get status from polygon
            with RESTClient(key) as client:
                resp = client.reference_market_status()
            MktInfo.objects.all().delete()              # get rid of previous db table entry
            m = MktInfo(mktStatus=resp.market, lastCheckTimeNY=d)
            m.save()                                    # and create new db entry
            return
        else:   # We are not at time when market status would change. just update time.
            m = MktInfo.objects.first()
            m.lastCheckTimeNY = d
            m.save()
            return

    else:  # first time here!  No object yet in database, so create it.
         key = os.getenv("APCA_API_KEY_ID")  # get status from polygon
         with RESTClient(key) as client:
             resp = client.reference_market_status()
         m = MktInfo(mktStatus=mktstatus, lastCheckTimeNY=d)
         m.save()                                    # and create new db entry - current time and status
         return


@shared_task(name="index_data")
def index_data():
    """Every 55 sec, update market indices in db."""

    def yahoo_index(ticker):
        """ returns tuple with status, price, and previous, for an index. as floats."""
        yhurl = "https://finance.yahoo.com/quote/^" + ticker
        try:
            page = requests.get(yhurl, timeout=2)
        except:
            print(f"ERROR: timeout on finance.yahoo.com/quote/{ticker}")
            return ('error', None, None,)
        else:
            soup = BeautifulSoup(page.text, features="html.parser")
            current_price = soup.find(class_="Trsdu(0.3s) Fw(b) Fz(36px) Mb(-4px) D(ib)")
            if not current_price:
                print(f"ERROR: Could not find current price element in page")
                return ('error', None, None,)
            prev_close = soup.find("span", {"data-reactid":"42"})
            if not prev_close:
                print(f"ERROR: Could not find previous close element in page")
                return ('error', None, None,)
            pstring = current_price.string
            pfloat = float(pstring.replace(',', ''))
            cstring = prev_close.string
            cfloat = float(cstring.replace(',', ''))
            return ('success', pfloat, cfloat,)

    t = timezone.localtime()        # NY time
    ms = MktInfo.objects.first()    # first check if market open
    if ms.mktStatus == 'open':
        firstrow = IndexData.objects.first()  # if open, is db showing today's data?
        if (firstrow is not None) and (timezone.localtime(firstrow.timeStampNY).day != t.day):
            IndexData.objects.all().delete()  # if not, market must have just opened
                                              # clear prev day's data when new trading day opens
        print(f"index_data task: getting indices at {t.strftime('%m/%d %H:%M')}")
        d = yahoo_index('DJI')
        if d[0] == 'error':
            print(f"error retrieving info for DJI")
        print(f"writing index data to db: DJI current= {d[1]}, previous= {d[2]}")
        s = yahoo_index('GSPC')
        if s[0] == 'error':
            print(f"error retrieving info for GSPC")
        print(f"writing index data to db: GSPC current= {s[1]}, previous= {s[2]}")
        n = yahoo_index('IXIC')
        if n[0] == 'error':
            print(f"error retrieving info for IXIC")
        print(f"writing index data to db: IXIC current= {n[1]}, previous= {n[2]}")
        id = IndexData(timeStampNY=t, DJIvalue=d[1], GSPCvalue=s[1], IXICvalue=n[1], prevDJIclose=d[2], prevGSPCclose=s[2], prevIXICclose=n[2])
        id.save()  # commit to db
    else:
        print("index_data task: Skipping index updates. Market is not open.")
    return


@shared_task(name="heartbeat")
def heartbeat():
    """This was used for debug only"""
    print("BEAT")
    return
