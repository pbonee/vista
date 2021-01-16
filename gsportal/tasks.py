import random
from celery import shared_task
from .models import MyUser, Account, Asset, AcctHolding, News, Alert, AlertQ

@shared_task(name="sum_two_numbers")
def add(x, y):
    return x + y

@shared_task(name="multiply_two_numbers")
def mul(x, y):
    total = x * (y * random.randint(3, 100))
    return total

@shared_task(name="sum_list_numbers")
def xsum(numbers):
    return sum(numbers)

@shared_task(name="heartbeat")
def heartbeat():
    print("BEAT")
    a = Asset.objects.get(assetSymbol='AAPL')
    print(a.lastPrice)
    a.lastPrice = 4
    a.save()
    return
