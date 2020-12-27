# Vista
Vista is a multi-user Web application for stock portfolio tracking.

## Description and Features
People may hold stocks in multiple accounts, e.g. a brokerage account, company 401(k), and IRA. They would like to monitor these investments but it is inconvenient to log into multiple accounts. Services like Yahoo Finance are a solution, but have drawbacks. They have a lot of clutter (ads, clickbait). It would be nice to have a personalized portal where you can track your stocks, on an account-aggregated basis. Vista fills this need.

#### Multi-user
The app supports multiple users. A user only sees their own account data.

#### Dashboard
Consolidated view of all your stocks. Dynamically updated with price data from US exchanges (via polygon.io) during market trading hours. The Dashboard view also includes charts showing performance of market indices (DJI, S&P500 and NASDAQ -- live data during market hours, previous session data after hours), and a scrolling ticker style view of news links relating to your stocks.

#### Accounts
There is a page where you manage the holdings to be tracked. You define your accounts and manage the holdings in those accounts.

#### Portfolio
A page that shows your aggregate holdings and asset allocation pie chart.

#### Alerts
A page where you set price-movement alerts. These will generate notifications to you via text alerts to your phone (through integration with Twilio) or on the Dashboard. In the Dashboard view there is a badge that indicates when you have received alerts, and clicking on that badge opens a modal window where you can read the alerts and delete them.

## Technical Description
The application is a Django-based Web app and uses JavaScript on the client side. It is mobile responsive. I have used responsive Bootstrap elements, e.g. responsive navbar that collapses to a mobile drop-down menu on a small screen. Files are organized as a standard Django project, with project name "Vista". There is a single app named "gsportal". All the views, models, and name-spaced templates and static files are within /gsportal. Key files include:
* views.py: Views for all user pages and API routes. APIs for the client include stock price updates, getting accounts content, and updating accounts content, for example when a user adds/deletes a stock in an account or changes the number of shares. Views.py is also responsible for getting real-time market data and queuing news links and alerts to be delivered to the clients. Alerts may also be sent to users' phones as text messages, and views.py manages this using the Twilio API.

* models.py: Models for users, financial accounts, account holdings, stocks info, news items, and alerts.

* gsportal.js:  This JavaScript file contains all the client code for dynamic page features such as refreshing stock prices and animations.

* layout.html: There are individual html files served for the pages, but they all build on a common layout.html file. This contains links to important JS add-in code via CDNs, including Bootstrap and Chart.js.

The Dashboard and Accounts pages rely heavily on AJAX to get information from the server on account holdings, stock prices, and various other information like market hours and alerts. The Dashboard in particular is designed to be dynamic. Stock prices are updated continuously. To highlight this activity for the user, CSS animation is used to make background color around stock prices momentarily transition more green or more red when the prices increase or decrease, respectively.  

Two data providers are used. Polygon (https://www.polygon.io) provides real-time stock price data, market status, and ticker-related news links. Market index information comes from Financial Modeling Prep (https://www.financialmodelingprep.com).  

## Demo
https://youtu.be/pZFIa2Fjv6M
