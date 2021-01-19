from celery import shared_task
import requests
from bs4 import BeautifulSoup
from .models import MyUser, Account, Asset, AcctHolding, News, Alert, AlertQ

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




@shared_task(name="heartbeat")
def heartbeat():
    print("BEAT")
    a = Asset.objects.get(assetSymbol='AAPL')
    print(a.lastPrice)
    a.lastPrice = 4
    a.save()
    return
