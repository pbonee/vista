from django.db import models
from django.forms import ModelForm
from django import forms
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from .models import MyUser, Account, Alert
from django.utils.translation import gettext_lazy as _

class MyUserCreationForm(UserCreationForm):

    class Meta(UserCreationForm):
        model = MyUser
        fields = ('username', 'mobile_number')

class MyUserChangeForm(UserChangeForm):

    class Meta(UserChangeForm):
        model = MyUser
        fields = ('username', 'mobile_number')

class AccountForm(ModelForm):
    class Meta:
        model = Account
        fields = ['acctName', 'providerName', 'providerURL', 'uploadFile']
        labels = {
            'acctName': _('Name of account'),
            'providerName': _('Bank or brokerage'),
            'providerURL': _('URL of bank/brokerage'),
            'uploadFile': _('CSV file of account holdings')
        }
        help_texts = {
            'acctName': _('How you want the account to be identified in Vista screens.'),
        }

class AlertForm(ModelForm):
    class Meta:
        model = Alert
        fields = ['symbol', 'movement', 'threshold', 'text_notification', 'email_notification']
        exclude = ['lastLook']
        labels = {
            'symbol': _('symbol'),
            'movement': _('goes above or below'),
            'threshold': _('price')
        }
