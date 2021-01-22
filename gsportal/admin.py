from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .forms import MyUserCreationForm, MyUserChangeForm
from .models import MyUser, Account, Asset, News, AcctHolding, Alert, AlertQ, MktInfo, IndexData

# Register your models here.

class MyUserAdmin(UserAdmin):
    add_form = MyUserCreationForm
    form = MyUserChangeForm
    model = MyUser
    list_display = ['username', 'mobile_number']
    fieldsets = UserAdmin.fieldsets + (
            (None, {'fields': ('mobile_number',)}),
    ) #this will allow to change these fields in admin module


admin.site.register(MyUser, MyUserAdmin)
admin.site.register(Account)
admin.site.register(Asset)
admin.site.register(News)
admin.site.register(Alert)
admin.site.register(AcctHolding)
admin.site.register(AlertQ)
admin.site.register(MktInfo)
admin.site.register(IndexData)
