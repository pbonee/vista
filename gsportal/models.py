from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
import uuid

# Create your models here.

class MyUser(AbstractUser):
    mobile_number = models.CharField(max_length=10, unique=True)

class Asset(models.Model):
    ASSET_TYPES = [
    ('growth', 'growth'),
    ('income', 'income'),
    ('cash', 'cash'),
    ]
    assetSymbol = models.CharField(max_length=6)
    lastPrice = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    openingPrice = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    # lastLook = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    lastLook = models.DateTimeField(auto_now=False, auto_now_add=False, null=True, blank=True)
    assetType = models.CharField(max_length=30, choices=ASSET_TYPES)

    def __str__(self):
	       return self.assetSymbol

class MktInfo(models.Model):
    """Just one row:  NY market status and last time checked, in NY time zone"""
    mktStatus = models.CharField(max_length=20)      # open, closed, extended hours
    lastCheckTimeNY = models.DateTimeField(auto_now=False, auto_now_add=False, null=True, blank=True)

    def __str__(self):
        return f"at {timezone.localtime(self.lastCheckTimeNY).strftime('%m/%d %H:%M')} NY, mkt status was: {self.mktStatus}"

    class Meta:
        verbose_name = "Market Info"
        verbose_name_plural = "Market Info"

class IndexData(models.Model):
    """Will hold current or previous day indices data points for charts. NY time stamps."""
    timeStampNY = models.DateTimeField(auto_now=False, auto_now_add=False, null=True, blank=True)
    DJIvalue = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    GSPCvalue = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    IXICvalue = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    prevDJIclose = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    prevGSPCclose = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    prevIXICclose = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"market indices at {timezone.localtime(self.timeStampNY).strftime('%m/%d %H:%M')} NY time"
    class Meta:
        verbose_name = 'Index Data'
        verbose_name_plural = 'Index Data'

class Account(models.Model):
    user = models.ForeignKey("MyUser", on_delete=models.CASCADE, related_name="accounts")
    acctID = models.CharField(max_length=5)  # no longer used. see note in add_acct route
    acctName = models.CharField(max_length=30)
    providerName = models.CharField(max_length=30, blank=True)
    providerURL = models.URLField(max_length=200, blank=True)
    uploadFile = models.FileField(upload_to='CSVfiles/', blank=True)

class AcctHolding(models.Model):
    account = models.ForeignKey("Account", on_delete=models.CASCADE, related_name="holdings")
    asset = models.ForeignKey("Asset", on_delete=models.CASCADE, related_name="accounts")
    quantity = models.PositiveIntegerField()

class News(models.Model):
    symbol = models.ForeignKey("Asset", on_delete=models.CASCADE, related_name="news")
    headline = models.CharField(max_length=400)
    articleURL = models.URLField(max_length=400)

    def __str__(self):
	       return f"{self.symbol}: {self.headline}"

    class Meta:
        verbose_name = 'News item'
        verbose_name_plural = 'News items'

class Alert(models.Model):
    UPDOWN_TYPES = [
    ('goes above', 'goes above'),
    ('goes below', 'goes below'),
    ]
    user = models.ForeignKey("MyUser", on_delete=models.CASCADE, related_name="alerts")
    symbol = models.ForeignKey("Asset", on_delete=models.CASCADE, related_name="alerts")
    movement = models.CharField(max_length=30, choices=UPDOWN_TYPES)
    threshold = models.DecimalField(max_digits=20, decimal_places=2)
    lastLook = models.DecimalField(max_digits=20, decimal_places=2)
    text_notification = models.BooleanField(default=False)
    email_notification = models.BooleanField(default=False)

    def __str__(self):
	       return f"alert id: {self.id}, when {self.symbol} {self.movement} {self.threshold}"

class AlertQ(models.Model):    # FIFO queue for alerts to go out to clients
    user = models.ForeignKey("MyUser", on_delete=models.CASCADE, related_name="alerts_in_Q")
    alertmessage = models.CharField(max_length=50)
    created = models.DateTimeField(auto_now_add=True)
    alertID = models.UUIDField(default=uuid.uuid4)

    class Meta:
        ordering = ('created',)
        verbose_name = 'Alert Queue'
        verbose_name_plural = 'Alert Queue'
