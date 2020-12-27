from django.urls import path
from . import views    	# to access views.py, located in same directory

urlpatterns = [
     path("", views.landing, name="landing"),
     path("dash", views.dash, name="dash"),
     path("login", views.signin, name="login"),
     path("logout", views.signout, name="logout"),
     path("register", views.register, name="register"),
     path("accounts", views.accounts, name="accounts"),
     path("add_acct", views.add_acct, name="add_acct"),
     path("acct_content", views.acct_content, name="acct_content"),
     path("add_holding", views.add_holding, name="add_holding"),
     path("edit_holding", views.edit_holding, name="edit_holding"),
     path("kick_me", views.kick_me, name="kick_me"),
     path("get_portfolio", views.get_portfolio, name="get_portfolio"),  # AJAX portfolio
     path("alerts", views.alerts, name="alerts"),
     path("portfolio", views.portfolio, name="portfolio"),              # static portfolio
     path("settings", views.settings, name="settings")

]
