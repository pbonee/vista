from django.shortcuts import render, redirect
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from .forms import MyUserCreationForm, MyUserChangeForm
from .models import MyUser, Account, Asset, AcctHolding, News, Alert, AlertQ, IndexData, MktInfo
from .forms import AccountForm, AlertForm
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm
from django.contrib.auth.decorators import login_required
from django import forms
import json
from django.views.decorators.csrf import csrf_exempt
from polygon import RESTClient
from datetime import datetime
from django.utils import timezone
from django.core.mail import send_mail
from dotenv import load_dotenv
import os

# Create your views here.

@login_required
def alerts(request):
    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    if request.method == 'POST':
        print(f"the button was: {request.POST['button']}")
        if request.POST['button'] == 'add-alert':
            form = AlertForm(request.POST)
            if form.is_valid():
                obj = form.save(commit=False)
                a = Asset.objects.filter(assetSymbol=obj.symbol)
                obj.lastLook = a[0].lastPrice   # last price we had for this asset
                obj.user = u
                obj.save()
                # symbol = form.cleaned_data['symbol']
                # movement = form.cleaned_data['movement']
                # threshold = form.cleaned_data['threshold']
                # text_notification = form.cleaned_data['text_notification']
                # email_notification = form.cleaned_data['email_notification']

                # provide user with a fresh form to create another alert
                form = AlertForm()
                alerts = Alert.objects.filter(user=u)
                return render(request, 'gsportal/alerts.html', {
                'form': form,
                'alerts': alerts
                })

            else:  # if form not valid, present it back to user for corrections
                alerts = Alert.objects.filter(user=u)
                return render(request, 'gsportal/alerts.html', {
                'form': form,
                'alerts': alerts
                })
        else:  # if not add-alert button then it must have been a row delete button
            if request.POST['button'][0:6] == 'delete': # make sure it was a delete
                pkd = request.POST['button'][6:]
                print(pkd)
                Alert.objects.filter(pk=pkd).delete()


            alerts = Alert.objects.filter(user=u)
            form = AlertForm()
            return render(request, 'gsportal/alerts.html', {
            'form': form,
            'alerts': alerts
            })

    else:  # if GET request, give alerts page to user along with create-alert form
        alerts = Alert.objects.filter(user=u)
        form = AlertForm()
        return render(request, 'gsportal/alerts.html', {
        'form': form,
        'alerts': alerts
        })


def landing(request):
    if request.user.is_authenticated:
        return redirect('dash')
    else:
	    return redirect('login')

@login_required
def dash(request):
    # request.session["polykey"] = os.getenv("APCA_API_KEY_ID")
    # request.session["fmpkey"] = os.getenv("FMP_API_KEY")
    return render(request, "gsportal/dash.html")

@login_required
def get_portfolio(request):
    # Similar to acct_content view, but like we have only one account.
    # Here the data structure is simply an array of row-data arrays. Each row:
    # [sym, price, price_chg, chg_pct, type, quantity, value, pct_of_total]
    # Last stocks row has sym = 'TOTAL' and show price_chg and value for portfolio.
    # Then we append news items with symbol $NEWS. Then we append $ALERTS.
    # Then come $DJI, $GSPC, $IXIC and $MKT rows.  See spec for data structure.
    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    accts = Account.objects.filter(user=u)
    portfolio = []
    holding = []
    accum_value = 0
    acctHldgs = AcctHolding.objects.filter(account__in=accts).order_by('-asset__assetType', 'asset__assetSymbol')
    for acctHldg in acctHldgs:
        # For each acctHldg, get its individual info
        asset = Asset.objects.filter(assetSymbol=acctHldg.asset)
        price = asset.values_list('lastPrice', flat=True)[0]  # price
        if price == None:
            price = 0
        openprice = asset.values_list('openingPrice', flat=True)[0] # openingprice
        assettype = asset.values_list('assetType', flat=True)[0] # type
        if assettype == 'cash':
            price = 1
        if (openprice == None or openprice == 0):
            pricechange = 0
            pricechangepct = 0
        else:
            pricechange = price - openprice
            pricechangepct = (pricechange / openprice)
        value = acctHldg.quantity * price
        accum_value += value  # accumulate aggregate portfolio value
        # Then check last portfolio holding was this same asset.
        if len(portfolio) > 0 and portfolio[-1][0] == f"{acctHldg.asset}":
            # Asset already in portfolio, so add to the existing holding row.
            portfolio[-1][5] = portfolio[-1][5] + acctHldg.quantity
            portfolio[-1][6] = portfolio[-1][6] + value
        else:
            # First time seeing this asset, so create a hew holding row.
            holding = [f"{acctHldg.asset}", price, pricechange, pricechangepct, assettype, acctHldg.quantity, value]
            portfolio.append(holding)

    # With portfolio array built, now go through and format for display.
    # Also while iterating through we can append value_pct to each row.
    for row in portfolio:
        if row[4] == 'cash':
            row[1] = ''
            row[2] = ''
            row[3] = ''
            row[5] = ''
        else:
            row[1] = '%.2f' % (row[1])
            row[2] = '%+.2f' % (row[2])
            row[3] = "{0:+.2%}".format(row[3])
            row[5] = str(row[5])
        if accum_value != 0:  # [6] is value. calc it as % of portfolio
            value_pct = row[6]/accum_value
        else:  # in case we don't have non-zero accum_value, set value_pct to 0.
            value_pct = 0
        row[6] = '${:,.2f}'.format(row[6])
        row.append("{0:.2%}".format(value_pct)) # append formatted value_pct

    # Now create last row for display of total portfolio
    row = ['TOTAL', '', '', '', '', '', '${:,.2f}'.format(accum_value), "{0:.2%}".format(1)]
    portfolio.append(row)

    # Now append news items.
    STORIES_PER_SYMBOL = 5  # Maximum number of news stories we'll get per stock
    rowsToAdd = []
    for i in range(STORIES_PER_SYMBOL):
        for row in portfolio:
            symbol = row[0]
            if symbol != 'CASH' and symbol != 'TOTAL':
                nsitems = News.objects.filter(symbol__assetSymbol=symbol)
                print(f"nsitems for {symbol}")
                print(nsitems)
                if len(nsitems) > i:
                    nsitem = nsitems[i]
                    newsItemRow = ['$NEWS', symbol, nsitem.headline, nsitem.articleURL]
                    rowsToAdd.append(newsItemRow)
    portfolio = portfolio + rowsToAdd   # this will put news as last rows of portfolio

    # Now append alerts
    rowsToAdd = []
    amsgs = AlertQ.objects.filter(user=u)

    for amsg in amsgs:
        alertRow = ['$ALERT', amsg.alertID, amsg.alertmessage]
        rowsToAdd.append(alertRow)
    portfolio = portfolio + rowsToAdd

    # Now work on market index rows.
    # We rely on db having a set of index data for previous trading day if we haven't
    # yet started a new trading day, or, if market is now open, having a set of
    # data points for indices in today's session.  Either way, we rely on the
    # db table having a set of data points all with same date. So we start with
    # earliest timestamp and take subsequent points every 30 minutes, for as many
    # 30-minute samples as we can get.

    i = IndexData.objects.all().order_by('timeStampNY')
    if len(i) > 0:
        # for DJ, S&P and NASDAQ, record the previous close and latest values
        d = ['$DJI', str(i[len(i)-1].prevDJIclose), str(i[len(i)-1].DJIvalue)]    # dji jones row
        s = ['$GSPC', str(i[len(i)-1].prevGSPCclose), str(i[len(i)-1].GSPCvalue)]   # gspc row
        n = ['$IXIC', str(i[len(i)-1].prevIXICclose), str(i[len(i)-1].IXICvalue)]    # ixic row
        # now go through every row of IndexData and pick the :00/:30 minute data points
        for j in i:
            if j.timeStampNY.minute % 30 == 0:    # if timestamp is :00 or :30 min
                d.append(str(j.DJIvalue))
                s.append(str(j.GSPCvalue))
                n.append(str(j.IXICvalue))
            # Give ourselves a bonus point if we're at 15:59, i.e. last minute of market day!
            # Do this since we do not get a point for "16:00" and we want one more point for charts.
            elif ((j.timeStampNY.hour == 15) and (j.timeStampNY.minute == 59)):
                d.append(str(j.DJIvalue))
                s.append(str(j.GSPCvalue))
                n.append(str(j.IXICvalue))
    else:
        print("ERROR in get_portfolio. IndexData appears to be empty. Skipping indices.")
        d = ['$DJI', 0]
        s = ['$GSPC', 0]
        n = ['$IXIC', 0]
    portfolio.append(d)
    portfolio.append(s)
    portfolio.append(n)

    # Onto end of portfolio array, append the market status
    ms = MktInfo.objects.first()
    lastrow = ['$MKT', timezone.localtime().strftime('%b %d %Y, %H:%M:%S'), ms.mktStatus]
    portfolio.append(lastrow)

    print(portfolio)
    return JsonResponse(portfolio, safe=False)

@csrf_exempt
@login_required
def delete_alert(request):
    if request.method == "POST":
        d = request.body.decode('utf-8')
        d = json.loads(d)
        a = AlertQ.objects.filter(alertID=d['alertID']).delete()
        print(f"del_alert processed request to delete alertID {d['alertID']}. result = {a}")
        if a[0] == 1:
            return JsonResponse({
            "success":"success!"
            }, status = 200)
        else:
            return JsonResponse({
            "error":"db error trying to delete that alertID"
            }, status = 400)
    else:
        return JsonResponse({
        "error": "delete_alert route requires POST"
        }, status = 400)


@login_required
def accounts(request):
    # Client will get everything through AJAX. Just provide generic template.
    return render(request, "gsportal/accounts.html")

@csrf_exempt
@login_required  # API route for edit holding in an acct
def edit_holding(request):
    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    print("Got to edit_holding route")
    if request.method == "POST":
        post_data = request.body.decode('utf-8')
        pd = json.loads(post_data)
        # These 2 fields must be supplied:
        if pd['editSymbol'] and pd['editType']:
            acctpk=pd['acct'][4:]   # this gives us pk of account
            prevSymbol=pd['prevSymbol']
            editSymbol=pd['editSymbol']
            editType=pd['editType']
            editQty = pd['editQty']
            if editQty == '':
                editQty = '0'
            editQty=int(editQty)    # text from input box, convert to int
            print(acctpk, prevSymbol, editSymbol, editType, editQty)

            # Only proceed if specified acct belongs to logged-in user.
            # Need this check because client hands us an account id. But we need to
            # guard against someone sending account ID for another user.
            a = Account.objects.filter(pk=acctpk).first()
            if a.user == u:   # OK to proceed if our signed in user is account owner
                # If no chg to symbol, update quantity and type.
                if prevSymbol == editSymbol:
                    # If quantity == 0 then delete the AcctHolding row
                    print(f"DEBUG: prevSymbol=editSymbol")
                    if editQty == 0:
                        AcctHolding.objects.filter(account__pk=acctpk, asset__assetSymbol=editSymbol).delete()
                        print(f"DEBUG: deleted this account holding")
                        # and also delete the Asset entirely if not in any other account
                        c = AcctHolding.objects.filter(asset__assetSymbol=editSymbol).count()
                        if c == 0:
                            Asset.objects.filter(assetSymbol=editSymbol).delete()
                            print("DEBUG: This symbol not in other accounts. Asset deleted.")
                    # Nonzero quantity, so take updated quantity and type values
                    else:
                        ah = AcctHolding.objects.filter(account__pk=acctpk, asset__assetSymbol=editSymbol).first()
                        ah.quantity = editQty
                        ah.save()
                        print("DEBUG: updated quantity")
                        at = Asset.objects.filter(assetSymbol=editSymbol).first()
                        at.assetType = editType
                        print("DEBUG: updated type")
                        at.save()
                # If symbol changed, we will delete entire old row and create new.
                # Delete old symbol in Asset table if not in other accounts.
                # Is new symbol an existing asset?
                # If new asset, add to Asset table also
                else:
                    print(f"DEBUG: symbol changed")
                    ac = Account.objects.get(pk=acctpk)  # this account. $$$$$$$ SB above based on User.
                    AcctHolding.objects.filter(account=ac, asset__assetSymbol=prevSymbol).delete()
                    # Was previous asset used anywhere else?
                    ah_other = AcctHolding.objects.filter(asset__assetSymbol=prevSymbol).count()
                    if ah_other == 0:  # if not in other account, delete the Asset
                        Asset.objects.filter(assetSymbol=prevSymbol).delete()
                        print(f"DEBUG: prev symbol not used in other accounts. Deleted.")
                    # Now see if the new symbol Asset is known to us
                    asc_new = Asset.objects.filter(assetSymbol=editSymbol).count()
                    if asc_new == 0:  # If don't already have it, create new Asset
                        ast = Asset(assetSymbol=editSymbol, assetType=editType)
                        print(f"DEBUG: This is a new symbol. Created Asset record.")
                    else:
                        # Already have the new symbol Asset. Just update type.
                        ast = Asset.objects.filter(assetSymbol=editSymbol).first()
                        ast.type = editType
                    ast.save()
                    # Now create the new AssetHolding for this account and the Asset
                    ah = AcctHolding(account=ac, asset=ast, quantity=editQty)
                    print(f"New AcctHolding created")
                return JsonResponse({
                "success":"success!"
                }, status = 200)

            else:
                # if the account owner !== signed in user:
                return JsonResponse({
                "error": "unauthorized"
                }, status = 401)

        else:
            return JsonResponse({
            "error":"malformed JSON"
            }, status = 406)
    else:
        return JsonResponse({
            "error": "add_holding route requires POST"
        }, status = 400)
    return redirect('accounts')


@csrf_exempt
@login_required  # API route for add holding to an acct
def add_holding(request):
    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    print("Got to add_holding route")
    if request.method == "POST":
        post_data = request.body.decode('utf-8')
        pd = json.loads(post_data)
        if pd['symbol'] and pd['type'] and pd['quantity']:
            if (pd['symbol'] != '') and (pd['type'] != '') and (pd['quantity'] != '0'):
                acctID=pd['acct']
                symbol=pd['symbol']
                type=pd['type']
                quantity=pd['quantity']
                # See if that symbol already in account. If so add quantity to that.
                accounta = Account.objects.filter(pk=acctID[4:])   # $$$$FIX TBD

                # Check that logged in user is really the owner of this account!
                if accounta[0].user != u:
                    return JsonResponse({
                    "error": "unauthorized"
                    }, status = 401)

                h = accounta[0].holdings.all()
                hlist = []
                for a in h:
                    hlist.append(a.asset.assetSymbol)
                if symbol in hlist:
                    # Acct already hold this stock. So add quantity.
                    asseta = Asset.objects.filter(assetSymbol=symbol).first()
                    hldg = AcctHolding.objects.filter(asset=asseta, account=accounta[0]).first()
                    print(hldg.quantity)
                    print(f"previous qty = {hldg.quantity}")
                    print(f"quantity to be added = {int(quantity)}")
                    sum = hldg.quantity + int(quantity)
                    hldg.quantity = sum
                    hldg.save()
                    print(f"new qty = {hldg.quantity}")
                    print(f"symbol = {hldg.asset.assetSymbol}")
                else:
                    # Stock not in acct yet, so add as a new stock.
                    # See of stock exists in Assets
                    symAsset = Asset.objects.filter(assetSymbol=symbol).first()
                    if not symAsset:
                        # add to Assets
                        symAsset = Asset(assetSymbol=symbol, assetType=type)
                    else:
                        # Asset already exists. Update type if necessary.
                        symAsset.assetType = type
                    symAsset.save()
                    newHldg = AcctHolding(account=accounta[0], asset=symAsset, quantity=quantity)
                    newHldg.save()
                    print(f"new asset {symAsset.assetSymbol} added to {accounta[0].acctID}")
                return JsonResponse({
                "success":"success!"
                }, status = 200)
            else:
                return JsonResponse({
                "error":"all 3 fields must be supplied"
                }, status = 406)
        else:
            return JsonResponse({
            "error":"malformed JSON"
            }, status = 406)
    else:
        return JsonResponse({
            "error": "add_holding route requires POST"
        }, status = 400)

    return redirect('accounts')

@login_required
def acct_content(request):
    # API route to provide updated accounts/holdings data.
    # For now, each time this is called we reach out to Alpaca API
    # to get latest stock prices.  TBD: Could be improved by having
    # the stock prices update occur asynchronously every few seconds
    # so when client makes request there is less latency.

    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    accounts = Account.objects.filter(user=u).order_by('-pk')
    acctContents1 = []
    for account in accounts:
        acctdict = {}
        acctdict['acctid'] = f"acct{account.pk}"
        acctdict['acctname'] = account.acctName
        acctdict['table_data'] = []
        acctHldgs = AcctHolding.objects.filter(account=account).order_by('-asset__assetType', 'asset__assetSymbol')
        for acctHldg in acctHldgs:
            asset = Asset.objects.filter(assetSymbol=acctHldg.asset)
            price = asset.values_list('lastPrice', flat=True)[0]  # price
            if price == None:
                price = 0

            openprice = asset.values_list('openingPrice', flat=True)[0] # openingprice
            assettype = asset.values_list('assetType', flat=True)[0] # type
            if assettype == 'cash':
                price = 1
            if (openprice == None or openprice == 0):
                pricechange = 0
                pricechangepct = 0
            else:
                pricechange = price - openprice
                pricechangepct = (pricechange / openprice)
            value = acctHldg.quantity * price
            if assettype == 'cash':
                row = [f"{acctHldg.asset}", '', '', '', assettype, '', '${:,.2f}'.format(value)]
            else:
                row = [f"{acctHldg.asset}", '%.2f' % (price), '%+.2f' % (pricechange), "{0:+.2%}".format(pricechangepct), assettype, str(acctHldg.quantity), '${:,.2f}'.format(value)]

            acctdict['table_data'].append(row)
        acctContents1.append(acctdict)

    return JsonResponse(acctContents1, safe=False)

@login_required
def add_acct(request):
    # User clicked +Add Acct tab to add a new account.
    # We allow up to 10 accounts. Give the user a form based on
    # Account model, to get account details. TBD: the user
    # can provide a CSV file with account holdings. Otherwise, the
    # account will be created empty and user will manually add assets
    # to the account in the newly added account tab
    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    if request.method == "POST":
        print(request.POST['submit'])
        if request.POST['submit'] == "cancel":
            return redirect('accounts')
        if request.POST['submit'] == "submit":
            numberAccts = Account.objects.filter(user=u).count()
            if numberAccts < 10:
                aID = f"acct{numberAccts}"   # No longer used.
                aName = request.POST["acctName"]
                pName = request.POST["providerName"]
                pURL = request.POST["providerURL"]
                uFile = request.POST["uploadFile"]
                print(aID, aName, pName, pURL, uFile)
                a = Account(user=u, acctID=aID, acctName=aName, providerName=pName, providerURL=pURL, uploadFile=uFile)
                a.save()
                return redirect('accounts')
            else:                # if problem with input, send form back to user
                return render(request, "gsportal/add_acct.html", {
                "form": form
                })
    # if HTTP method was GET then we got here because user just clicked
    # the +Add link, so provide user the input form.
    form = AccountForm()
    return render(request, "gsportal/add_acct.html", {
    "form": form
    })

@login_required
def portfolio(request):
    u = MyUser.objects.filter(pk=request.user.pk).first()  # identify our user
    accts = Account.objects.filter(user=u)
    portfolio = []
    holding = []
    accum_value = 0
    accum_growth = 0
    accum_income = 0
    accum_cash = 0
    acctHldgs = AcctHolding.objects.filter(account__in=accts).order_by('-asset__assetType', 'asset__assetSymbol')
    for acctHldg in acctHldgs:
        # For each acctHldg, get its individual info
        asset = Asset.objects.filter(assetSymbol=acctHldg.asset)
        price = asset.values_list('lastPrice', flat=True)[0]  # price
        if price == None:
            price = 0

        assettype = asset.values_list('assetType', flat=True)[0] # type
        if assettype == 'cash':
            price = 1

        value = acctHldg.quantity * price
        if assettype == 'income':
            accum_income += value
        if assettype == 'growth':
            accum_growth += value
        if assettype == 'cash':
            accum_cash += value
        accum_value += value  # accumulate aggregate portfolio value
        # Then check last portfolio holding was this same asset.
        if len(portfolio) > 0 and portfolio[-1][0] == f"{acctHldg.asset}":
            # Asset already in portfolio, so add to the existing holding row.
            portfolio[-1][3] = portfolio[-1][3] + acctHldg.quantity
            portfolio[-1][4] = portfolio[-1][4] + value
        else:
            # First time seeing this asset, so create a hew holding row.
            holding = [f"{acctHldg.asset}", price, assettype, acctHldg.quantity, value]
            portfolio.append(holding)

    # With portfolio array built, now go through and format for display.
    # Also while iterating through we can append value_pct to each row.
    for row in portfolio:
        if row[2] == 'cash':
            row[1] = ''
            row[3] = ''
            row[4] = '${:,.2f}'.format(row[4])
        else:
            row[4] = '${:,.2f}'.format(row[4])
    accum_income_f = '${:,.2f}'.format(accum_income)
    accum_growth_f = '${:,.2f}'.format(accum_growth)
    accum_cash_f = '${:,.2f}'.format(accum_cash)

    types = ["income", "growth", "cash"]

    return render(request, 'gsportal/portfolio.html', {
        "types": types,
        "hldgs": portfolio,
        "accum_cash": accum_cash,           # numbers
        "accum_income": accum_income,
        "accum_growth": accum_growth,
        "accum_cash_f": accum_cash_f,       # formatted strings
        "accum_income_f": accum_income_f,
        "accum_growth_f": accum_growth_f
    })


def register(request):
    # request.session["polykey"] = os.getenv("APCA_API_KEY_ID")
    # request.session["fmpkey"] = os.getenv("FMP_API_KEY")
    if request.user.is_authenticated:
        return redirect('dash')
    if request.method == 'POST':
        form = MyUserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password1')
            user = authenticate(username=username, password=password)
            login(request, user)
            return redirect('dash')
        else:
            return render(request, 'gsportal/register.html', {'form': form})
    else:
        form = MyUserCreationForm()
        return render(request, 'gsportal/register.html', {'form': form})

def signin(request):
    if request.user.is_authenticated:
        return render(request, 'gsportal/dash.html')
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('dash')
        else:
            form = AuthenticationForm(request.POST)
            return render(request, 'gsportal/login.html', {'form': form})
    else:
        form = AuthenticationForm()
        return render(request, 'gsportal/login.html', {'form': form})

def signout(request):
    print("got to signout")
    logout(request)
    return redirect('login')

@login_required
def settings(request):
    if request.method == 'POST':
        u = MyUser.objects.filter(pk=request.user.pk).first()
        if request.POST.get('submit') == 'update_email_address':
            e = request.POST['email_address']
            try:
                validate_email(e)
            except ValidationError as e:
                print(f"email validation error: {e}")
                return render(request, "gsportal/settings.html", {"msg":"failure"})
            else:
                u.email = e
                u.save()
                print(f"email saved: {u.email}")
                return render(request, "gsportal/settings.html", {"msg":"success"})

        elif request.POST.get('submit') == 'update_mobile_number':
            m = request.POST['mobile_number']
            if (len(m) >= 10) and (len(m) < 13):
                u.mobile_number = m
                u.save()
                print(f"phone number saved: {u.mobile_number}")
                return render(request, "gsportal/settings.html", {"msg":"success"})
            else:
                return render(request, "gsportal/settings.html", {"msg":"failure"})
        elif request.POST.get('submit') == 'update_password':
            pw = request.POST['password']
            pwa = request.POST['password_again']
            if pw == pwa:
                u.set_password(pw)
                u.save()
                print(f"New password set")
                return render(request, "gsportal/settings.html", {"msg":"success"})
            else:
                return render(request, "gsportal/settings.html", {"msg":"failure"})
        else:
            return render(request, "gsportal/settings.html", {"msg":"failure"})

    else:
        return render(request, "gsportal/settings.html", {"msg":""})
