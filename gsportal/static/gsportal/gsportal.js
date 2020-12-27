// Every time a page is loaded:
document.addEventListener("DOMContentLoaded", function() {
  setInterval(getMarket, 10000);  // kick off every 10 sec  update for navbar time.
  if (window.location.pathname == "/dash") {
    console.log("executing script for /dash");
    localStorage.setItem('displayAcct', '');  // set flag so next time to accts tab default to first tab
    document.querySelector("#navDash").classList.add("active");
    // localStorage.clear();
    localStorage.setItem("newsQi", 0); //initialize news item index
    newsFrame1(true);  // fill marquee.  true => don't set next newsFrame event timer. Do this
    newsFrame2(true);  // because we're just starting page and want to initialize scroller content
    newsFrame3(true);  // but we don't want to start clock for ongoing writes. That must be synced
    newsFrame4(true);  // to marquee scroll. A separate event will do that later. (newsFrame0)

    // We are painting Dashboard page. First we will do immediate getMarket() so
    // there is immediate data in upper right hand navbar for time and status.
    // Then we'll use this time information to determine what data we'll need to
    // get for the graphs.

    const polykey = document.querySelector('#polykey').innerText;
    fetch('https://api.polygon.io/v1/marketstatus/now?apiKey=' + polykey)
    .then((resp) => resp.json())
    .then(data =>  {
      let dateStr = data.serverTime.slice(0,10);
      console.log(`dateStr = ${dateStr}`);
      let dt = new Date(data.serverTime);
      dt = new Date(dt.toLocaleString("en-US", {timeZone: "America/New_York"}));
      dt = dt.toString();
      let n = dt.indexOf("GMT");
      dt = dt.slice(4, n-4);
      dt = dt + " ET";
      console.log(`initial check of market = ${data.market}`);
      console.log(`initial check of time = ${dt}`);
      document.querySelector('#timefield').innerHTML = dt;
      document.querySelector('#marketfield').innerHTML = data.market;
      localStorage.setItem("marketStat", data.market);  // remember this
      let mktIsOpen = (data.market == 'open');
      let mktIsExtHours = (data.market == 'extended-hours');
      let mktIsClosed = (data.market == 'closed');
      let hourInt = dt.slice(12,14);
      let minInt = dt.slice(15,17);
      console.log(mktIsOpen, mktIsExtHours, mktIsClosed);
      console.log(`HH=${hourInt}, MM=${minInt}`);  // hours
      const fmpkey = document.querySelector('#fmpkey').innerText;
      let fmpBaseURL = 'https://financialmodelingprep.com/api/v3/historical-chart/';
      let exchanges = ['%5EDJI', '%5EIXIC', '%5EGSPC'];
      let apiKey = '?apikey=' + fmpkey;
      // fmp URL = fmpBaseURL + mins + exchange + apiKey
      var mins;
      if ((mktIsOpen) && (parseInt(hourInt) < 10)) {
        // 9:30 to 10:00.  Use 1-min series.
        mins = '1min/';
        console.log("Will use 1-minute bars for charts.")
      }
      else {
        // Any other time, 30-min series is good enough.
        mins = '30min/';
        console.log("Will use 30-minute bars for charts.")
      };

      // Go to FMP and get the market index bars. For 3 indices. One at a time.
      // Each chart must be done within code block of fetch. (need response data )
      // Will do Dow Jones index first:
        let exchange = exchanges[0];
        fmpurl = fmpBaseURL + mins + exchange + apiKey;
        console.log(fmpurl);
        fetch(fmpurl)
        .then((resp) => resp.json())
        .then(fmpdata => {
          // From FMP market index bars, extract data for graphs. Full graph is set up
          // for 14 points, representing a full set of 30-minute bars in a trading day.
          // If we're in market hours, need to build a partial set, with less than
          // 14 points.
          console.log(fmpdata);
          let ticks = [];  // build array of tick times, in ascending order (unshift latest ticks in)
          if (mktIsOpen) {
            // we'll subtract :30 from time to get tick points. But start with
            // nearest HH:00 or HH:30.
            let mm = minInt;
            let hh = hourInt;
            if (parseInt(mm) >= 30) {
              mm = '30';
            }
            else {
              mm = '00';
            }
            ticks.unshift(hh + ':' + mm);  // our latest half-hour tick
            while (!(hh == '09' && mm == '30')) {   // stop after pushing "09:30" into the array
              // subtract 30 from hhmm and unshift next tick into [ticks]
              if (mm == '30') {   // if hh:30 then it becomes hh:00
                mm = '00';
              }
              else {         // if hh:00 then it becomes hh:30 with the hh decremented
                hh = ('0' + (parseInt(hh) - 1)).slice(-2); // decrement hh but keep as hh string
                mm = '30';
              }
              ticks.unshift(hh + ':' + mm);
            }
          }
          else {
            // build [ticks] for case where market is closed.  easy.
            ticks = ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
          }
          console.log({ticks});
          let closeps = [];  // will create array of index close prices for this index

          for (tick of ticks) {
            let close = searchBars(dateStr, tick, fmpdata, mktIsOpen);
            closeps.push(close);
            console.log(`at ${tick} the close price was ${close}`);
          };
          if (closeps.length == 1) {
            let oneMore = fmpdata[0].close;   // this will be the most recent data record
            closeps.push(oneMore);
          }
          // Update the index pricing on page
          let basis0 = searchYestClose(dateStr, fmpdata);  // closing price from prior trading day
          if (closeps.length == 0) {
            let price0 = basis0;  // in case we don't have today's first bar, let price = yesterday's close
          }
          else {
            price0 = closeps[closeps.length-1];
          };
          let prcchg0 = price0 - basis0;
          if (prcchg0 >= 0) {
            prcchg0 = '+' + prcchg0.toFixed(2);  // convert to string with plus sign
          }
          else {
            prcchg0 = prcchg0.toFixed(2);   // convert to string (will include minus sign)
          };
          document.querySelector('#dcurrent').innerHTML = price0.toFixed(2);
          document.querySelector('#dchange').innerHTML = prcchg0;
          if (prcchg0.slice(0,1) == '+') {
            document.querySelector('#dchange').style.color = 'green';
          };
          if (prcchg0.slice(0,1) == '-') {
            document.querySelector('#dchange').style.color = 'red';
          };

          // paint the DJI chart
          var ctx0 = document.getElementById("dowChart").getContext("2d");
          const gradient0 = ctx0.createLinearGradient(0, 0, 0, 80);
          gradient0.addColorStop(0, document.querySelector('#dchange').style.color);
          gradient0.addColorStop(1, "white");
          let sugMax = 1.01 * Math.max(...closeps);
          let sugMin = 0.99 * Math.min(...closeps);
          var chart0 = new Chart(ctx0, {
            // The type of chart we want to create
            type: "line",

            // The data for our dataset
            data: {
              labels: ["9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"],
              datasets: [
                {
                  label: "DJI",
                  backgroundColor: gradient0,
                  borderColor: document.querySelector('#dchange').style.color,
                  pointRadius: 0,
                  spanGaps: false,
                  data: closeps
                }
              ]
            },
            // Configuration options go here
            options: {
              scales: {
                  yAxes: [{
                      ticks: {
                          min: sugMax,
                          max: sugMin
                      }
                  }]
              },
              legend: { display: false },
              maintainAspectRatio: false
            }
          });

        });   // Inner fetch. This one for FMP data series. First time - DJI chart.

        // Now for the NASDAQ chart:
        exchange = exchanges[1];
        fmpurl = fmpBaseURL + mins + exchange + apiKey;
        console.log(fmpurl);
        fetch(fmpurl)
        .then((resp) => resp.json())
        .then(fmpdata => {
          // From FMP market index bars, extract data for graphs. Full graph is set up
          // for 14 points, representing a full set of 30-minute bars in a trading day.
          // If we're in market hours, need to build a partial set, with less than
          // 14 points.
          console.log(fmpdata);
          let ticks = [];  // build array of tick times, in ascending order (unshift latest ticks in)
          if (mktIsOpen) {
            // we'll subtract :30 from time to get tick points. But start with
            // nearest HH:00 or HH:30.
            let mm = minInt;
            let hh = hourInt;
            if (parseInt(mm) >= 30) {
              mm = '30';
            }
            else {
              mm = '00';
            }
            ticks.unshift(hh + ':' + mm);  // our latest half-hour tick
            while (!(hh == '09' && mm == '30')) {   // stop after pushing "09:30" into the array
              // subtract 30 from hhmm and unshift next tick into [ticks]
              if (mm == '30') {   // if hh:30 then it becomes hh:00
                mm = '00';
              }
              else {         // if hh:00 then it becomes hh:30 with the hh decremented
                hh = ('0' + (parseInt(hh) - 1)).slice(-2); // decrement hh but keep as hh string
                mm = '30';
              }
              ticks.unshift(hh + ':' + mm);
            }
          }
          else {
            // build [ticks] for case where market is closed.  easy.
            ticks = ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
          }
          console.log({ticks});
          let closeps = [];  // will create array of index close prices for this index
          for (tick of ticks) {
            let close = searchBars(dateStr, tick, fmpdata, mktIsOpen);
            closeps.push(close);
            console.log(`at ${tick} the close price was ${close}`);
          };
          if (closeps.length == 1) {
            let oneMore = fmpdata[0].close;   // this will be the most recent data record
            closeps.push(oneMore);
          }
          // Update the index pricing on page
          let basis0 = searchYestClose(dateStr, fmpdata);  // closing price from prior trading day
          if (closeps.length == 0) {
            let price0 = basis0;  // in case we don't have today's first bar, let price = yesterday's close
          }
          else {
            price0 = closeps[closeps.length-1];
          };
          let prcchg0 = price0 - basis0;
          if (prcchg0 >= 0) {
            prcchg0 = '+' + prcchg0.toFixed(2);  // convert to string with plus sign
          }
          else {
            prcchg0 = prcchg0.toFixed(2);   // convert to string (will include minus sign)
          };
          document.querySelector('#ncurrent').innerHTML = price0.toFixed(2);
          document.querySelector('#nchange').innerHTML = prcchg0;
          if (prcchg0.slice(0,1) == '+') {
            document.querySelector('#nchange').style.color = 'green';
          };
          if (prcchg0.slice(0,1) == '-') {
            document.querySelector('#nchange').style.color = 'red';
          };
          // paint the NASDAQ chart
          var ctx1 = document.getElementById("nasdaqChart").getContext("2d");
          const gradient1 = ctx1.createLinearGradient(0, 0, 0, 80);
          gradient1.addColorStop(0, document.querySelector('#nchange').style.color);
          gradient1.addColorStop(1, "white");
          let sugMax = 1.01 * Math.max(...closeps);
          let sugMin = 0.99 * Math.min(...closeps);
          var chart1 = new Chart(ctx1, {
            // The type of chart we want to create
            type: "line",

            // The data for our dataset
            data: {
              labels: ["9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"],
              datasets: [
                {
                  label: "IXIC",
                  backgroundColor: gradient1,
                  borderColor: document.querySelector('#nchange').style.color,
                  pointRadius: 0,
                  spanGaps: false,
                  data: closeps
                }
              ]
            },
            // Configuration options go here
            options: {
              scales: {
                  yAxes: [{
                      ticks: {
                          min: sugMax,
                          max: sugMin
                      }
                  }]
              },
              legend: { display: false },
              maintainAspectRatio: false
            }
          });
        });   // Inner FMP fetch - 2nd time for NASDAQ chart. This one for FMP data series.


        // Now for the SP500 chart:
        exchange = exchanges[2];
        fmpurl = fmpBaseURL + mins + exchange + apiKey;
        console.log(fmpurl);
        fetch(fmpurl)
        .then((resp) => resp.json())
        .then(fmpdata => {
          // From FMP market index bars, extract data for graphs. Full graph is set up
          // for 14 points, representing a full set of 30-minute bars in a trading day.
          // If we're in market hours, need to build a partial set, with less than
          // 14 points.
          console.log(fmpdata);
          let ticks = [];  // build array of tick times, in ascending order (unshift latest ticks in)
          if (mktIsOpen) {
            // we'll subtract :30 from time to get tick points. But start with
            // nearest HH:00 or HH:30.
            let mm = minInt;
            let hh = hourInt;
            if (parseInt(mm) >= 30) {
              mm = '30';
            }
            else {
              mm = '00';
            }
            ticks.unshift(hh + ':' + mm);  // our latest half-hour tick
            while (!(hh == '09' && mm == '30')) {   // stop after pushing "09:30" into the array
              // subtract 30 from hhmm and unshift next tick into [ticks]
              if (mm == '30') {   // if hh:30 then it becomes hh:00
                mm = '00';
              }
              else {         // if hh:00 then it becomes hh:30 with the hh decremented
                hh = ('0' + (parseInt(hh) - 1)).slice(-2); // decrement hh but keep as hh string
                mm = '30';
              }
              ticks.unshift(hh + ':' + mm);
            }
          }
          else {
            // build [ticks] for case where market is closed.  easy.
            ticks = ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
          }
          console.log({ticks});
          let closeps = [];  // will create array of index close prices for this index
          for (tick of ticks) {
            let close = searchBars(dateStr, tick, fmpdata, mktIsOpen);
            closeps.push(close);
            console.log(`at ${tick} the close price was ${close}`);
          };
          if (closeps.length == 1) {
            let oneMore = fmpdata[0].close;   // this will be the most recent data record
            closeps.push(oneMore);
          }
          // Update the index pricing on page
          let basis0 = searchYestClose(dateStr, fmpdata);  // closing price from prior trading day
          if (closeps.length == 0) {
            let price0 = basis0;  // in case we don't have today's first bar, let price = yesterday's close
          }
          else {
            price0 = closeps[closeps.length-1];
          };
          let prcchg0 = price0 - basis0;
          if (prcchg0 >= 0) {
            prcchg0 = '+' + prcchg0.toFixed(2);  // convert to string with plus sign
          }
          else {
            prcchg0 = prcchg0.toFixed(2);   // convert to string (will include minus sign)
          };
          document.querySelector('#scurrent').innerHTML = price0.toFixed(2);
          document.querySelector('#schange').innerHTML = prcchg0;
          if (prcchg0.slice(0,1) == '+') {
            document.querySelector('#schange').style.color = 'green';
          };
          if (prcchg0.slice(0,1) == '-') {
            document.querySelector('#schange').style.color = 'red';
          };

          // paint the SP500 chart
          var ctx2 = document.getElementById("sandpChart").getContext("2d");
          const gradient2 = ctx2.createLinearGradient(0, 0, 0, 80);
          gradient2.addColorStop(0, document.querySelector('#schange').style.color);
          gradient2.addColorStop(1, "white");
          let sugMax = 1.01 * Math.max(...closeps);
          let sugMin = 0.99 * Math.min(...closeps);
          var chart2 = new Chart(ctx2, {
            // The type of chart we want to create
            type: "line",

            // The data for our dataset
            data: {
              labels: ["9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"],
              datasets: [
                {
                  label: "S&P",
                  backgroundColor: gradient2,
                  borderColor: document.querySelector('#schange').style.color,
                  pointRadius: 0,
                  spanGaps: false,
                  data: closeps
                }
              ]
            },
            // Configuration options go here
            options: {
              scales: {
                  yAxes: [{
                      ticks: {
                          min: sugMax,
                          max: sugMin
                      }
                  }]
              },
              legend: { display: false },
              maintainAspectRatio: false
            }
          });
        });   // Inner FMP fetch - 3rd time for SP500 chart. This one for FMP data series.

    });  // this is 2nd .then from fetch of marketstatus from Polygon (outer of 2 fetches)

    // End of charts code block for top div on Dashboard page.
    // Now update alerts badge and fill modal body with alerts text if any.



    // We're painting Dashboard. Next thing to work on is news feed.
    // Get a batch of news items from Django get_news route. Then feed this into the
    // scrolling div, which  holds 4 news items. (3 visible between onanimationiteration events).

    let keyDiv0 = document.querySelector("#keydiv0");  // this is msg0 crossing top of marquee
    keyDiv0.onanimationiteration = newsFrame0;

    function newsFrame0() {
      console.log("MARK_-1");
      setTimeout(newsFrame1, 2400);  // Update msg0/msg4 in 1.5 sec.
    }

    function newsFrame1(oneOff) {  // if oneOff=true, don't setTimeout to run again
      console.log("MARK_0");        // time now to update msg0/msg4
      let newsQ = JSON.parse(localStorage.getItem("newsQ") || "[]");
      let i = localStorage.getItem("newsQi") || 0;  // index
      if (newsQ.length >= 4) {   // only paint news if sufficient items
        document.querySelector('#msg0').innerHTML = newsQ[i][0] + ': ' + newsQ[i][1];
        document.querySelector('#msg4').innerHTML = newsQ[i][0] + ': ' + newsQ[i][1];
        document.querySelector('#msg0').setAttribute("href", newsQ[i][2]);
        document.querySelector('#msg0').setAttribute("target", "_blank");
        document.querySelector('#msg4').setAttribute("href", newsQ[i][2]);
        document.querySelector('#msg4').setAttribute("target", "_blank");

      }
      if (!oneOff) {setTimeout(newsFrame2, 2400);};
    }

    function newsFrame2(oneOff) {
      console.log("MARK_1");        // time now to update msg1/msg5
      let newsQ = JSON.parse(localStorage.getItem("newsQ") || "[]");
      let i = localStorage.getItem("newsQi") || 0;  // index
      if (newsQ.length >= 4) {   // only paint news if sufficient items
        document.querySelector('#msg1').innerHTML = newsQ[i*1+1][0] + ': ' + newsQ[i*1+1][1];
        document.querySelector('#msg5').innerHTML = newsQ[i*1+1][0] + ': ' + newsQ[i*1+1][1];
        document.querySelector('#msg1').setAttribute("href", newsQ[i*1+1][2]);
        document.querySelector('#msg1').setAttribute("target", "_blank");
        document.querySelector('#msg5').setAttribute("href", newsQ[i*1+1][2]);
        document.querySelector('#msg5').setAttribute("target", "_blank");
      }
      if (!oneOff) {setTimeout(newsFrame3, 2400);};
    }

    function newsFrame3(oneOff) {
      console.log("MARK_2");        // time now to update msg2/msg6
      let newsQ = JSON.parse(localStorage.getItem("newsQ") || "[]");
      let i = localStorage.getItem("newsQi") || 0;  // index
      if (newsQ.length >= 4) {   // only paint news if sufficient items
        document.querySelector('#msg2').innerHTML = newsQ[i*1+2][0] + ': ' + newsQ[i*1+2][1];
        document.querySelector('#msg6').innerHTML = newsQ[i*1+2][0] + ': ' + newsQ[i*1+2][1];
        document.querySelector('#msg2').setAttribute("href", newsQ[i*1+2][2]);
        document.querySelector('#msg2').setAttribute("target", "_blank");
        document.querySelector('#msg6').setAttribute("href", newsQ[i*1+2][2]);
        document.querySelector('#msg6').setAttribute("target", "_blank");
      }
      if (!oneOff) {setTimeout(newsFrame4, 2400);};
    }

    function newsFrame4() {
      console.log("MARK_3");        // time now to update msg3/msg7
      let newsQ = JSON.parse(localStorage.getItem("newsQ") || "[]");
      let i = localStorage.getItem("newsQi") || 0;  // index
      if (newsQ.length >= 4) {   // only paint news if sufficient items
        document.querySelector('#msg3').innerHTML = newsQ[i*1+3][0] + ': ' + newsQ[i*1+3][1];
        document.querySelector('#msg7').innerHTML = newsQ[i*1+3][0] + ': ' + newsQ[i*1+3][1];
        document.querySelector('#msg3').setAttribute("href", newsQ[i*1+3][2]);
        document.querySelector('#msg3').setAttribute("target", "_blank");
        document.querySelector('#msg7').setAttribute("href", newsQ[i*1+3][2]);
        document.querySelector('#msg7').setAttribute("target", "_blank");
      localStorage.setItem("newsQi", ((i*1 + 4) % newsQ.length));
      }
    }

    // We're painting Dashboard. Next things to work on are getting news
    // items for news pane and price info for portfolio table.

    // Data fetched from Django get_portfolio route.

    fetch('/get_portfolio')   // This is one of two places where we use this route.
    .then((resp) => resp.json())
    .then(data => {

      // data is an array of arrays. Includes row arrays for portfolio holdings table.
      // Appended to array are additional news-items, which are also arrays.
      // The portfolio row-arrays have an asset symbol as first element.
      // The news arrays will be marked by "$NEWS" as their first element.
      // format: ['$NEWS', 'symbol', 'title', 'url']
      // Server responsible for giving us randomized (not consecutive stories for the
      // same symbol) news items. We push them into end of [newsQ]. When we take items
      // from queue for display we will read from front of queue. As we push new items
      // into the queue we check size of queue and discard old items to keep queue
      // no larger than 100 items.
      // Appended to this are alert items, denoted with '$ALERT' as first item.

      // Pop alert items and store in browser storage alertQ
      let alertQ = JSON.parse(localStorage.getItem("alertQ"));
      if (alertQ == null) {
        alertQ = [];
      };
      while (data[data.length -1][0] == '$ALERT') {
        console.log('processing incoming alert line 518');
        alertItem = data.pop();
        alertItem.shift();    // discard the '$ALERT' symbol
        alertItem.unshift(guidGenerator()); // prepend guid
        alertQ.push(alertItem);  // put news into alertQ
      };
      if (alertQ.length > 5) {  // we'll discard anything over 5 alerts for now
        alertQ.splice(0, alertQ.length - 5);
      };
      console.log(`Here is the current alert queue:`);
      console.log(alertQ);
      localStorage.setItem("alertQ", JSON.stringify(alertQ));

      // Pop news items from server and store them in browser storage - newsQ.
      let newsQ = JSON.parse(localStorage.getItem("newsQ") || "[]");

      while (data[data.length -1][0] == '$NEWS') {
        newsItem = data.pop();
        newsItem.shift();    // discard the '$NEWS' symbol
        newsQ.unshift(newsItem);  // put news into front of the newsQ
      };
      if (newsQ.length > 100) {  // if over 100 news items, discard old ones
        newsQ.splice(100);
      };
      console.log("got there");
      console.log(`Here is the current news queue:`);
      console.log(newsQ);
      localStorage.setItem("newsQ", JSON.stringify(newsQ));
      // Now remaining data are row-arrays for the portfolio table in dashboard.
      // To prepare that for building table, prepend a row with column headings.
      const hdrCells = ['symbol', 'price', 'change', '%change', 'type', 'quantity', 'value', '%'];
      data.unshift(hdrCells);
      dashTable = build_table(data);  // this function will build table
      document.querySelector('#table_container').appendChild(dashTable)  // put table in DOM
      })  // last .then of fetch(/get_portfolio)

  updateAlerts(); // update the alerts badge and modal content - first load of page
  } // end of if dash block

  else if (window.location.pathname == "/accounts") {
    getMarket()   // update upper right time/status, on this new page
    document.querySelector("#navAcct").classList.add("active");
    // Accounts page contains a tabbed div where account tables go.
    // For now the column headings are fixed and have following labels:
    const table_headings = ['symbol', 'price', 'change', '%change', 'type', 'quantity', 'value', ''];
    console.log("executing script for /accounts");
    fetch('/acct_content')
    .then((resp) => resp.json())
    .then(data =>  {
    console.log(data);
    let acct_content = data;

    // acct_content is an array of account objects containing data for accounts.
    // These will be prepended to the page, so put them in reverse order to how
    // you want the tabs to appear.

    // TBD: GET /accounts and populate local data in memory here.
    // TBD: Set up a timer that runs refresh function, to get latest data
    // from server and refresh the displayed tables.

      // for each account:
      acct_content.forEach(acct_data => {
        // build tab for the tabbed tables and add to DOM
        let navTab = document.createElement("li");
        navTab.classList.add("nav-item");
        let navTabLink = document.createElement("a");
        navTabLink.classList.add("nav-link");
        navTabLink.setAttribute("id", "Tab" + acct_data.acctid);
        navTabLink.setAttribute("data-toggle", "tab");
        navTabLink.setAttribute("href", "#" + acct_data.acctid);
        let navTabText = document.createTextNode(acct_data.acctname);
        navTabLink.appendChild(navTabText);
        navTab.appendChild(navTabLink);
        document.querySelector("#accttabs").prepend(navTab);

        // build div to hold table content
        let acctDiv = document.createElement("div");
        acctDiv.classList.add("tab-pane", "fade");
        acctDiv.setAttribute("id", acct_data.acctid);    // don't add to DOM until we fill it with table data

        // create table and start with head row
        let table = document.createElement("table");
        table.setAttribute("id", "Table" + acct_data.acctid);  // ex: 'tableacct13'
        table.classList.add("table", "table-sm", "table-hover", "table-responsive-md");
        let headRow = document.createElement("tr");
        table_headings.forEach(function(hdg) {
          let headCell = document.createElement("th");
          headCell.classList.add("font-weight-light", "small");
          headCell.style.textAlign = "right";
          headCell.appendChild(document.createTextNode(hdg));
          headRow.appendChild(headCell);
        });
        let tHead = document.createElement("thead");
        tHead.classList.add("thead-light");
        tHead.appendChild(headRow);
        table.appendChild(tHead);

        // create rows of table data for all assets in account
        // for each row:
        acct_data.table_data.forEach(row_data => {
          let row = document.createElement("tr");
          // for each cell:
          row_data.forEach(cell_data => {
            let cell = document.createElement("td");
            cell.appendChild(document.createTextNode(cell_data));
            cell.style.textAlign = "right";
            row.appendChild(cell);
            if (cell_data[0] == '+') {
              cell.style.color = "green";
            };
            if (cell_data[0] == '-') {
              cell.style.color = "red";
            };
          });  // forEach cell_data

          let svgHTML = document.querySelector('.mySVG').cloneNode(true);
          svgHTML.style.display="inline-block";
          let edit_button = document.createElement("a");
          edit_button.classList.add();
          edit_button.appendChild(svgHTML);
          edit_button.style.cursor = "pointer";
          edit_button.setAttribute("id", "edit" + row_data[0] + "_" + acct_data.acctid);
          edit_button.setAttribute("onclick", "assetEditHandler(this)");
          let td_for_button = document.createElement("td");
          td_for_button.appendChild(edit_button);
          td_for_button.setAttribute("align", "center");

          // color row depending on <td>[4] which is 'cash', 'income', or 'growth'
          let type = row.childNodes[4].innerHTML;
          if (type == "cash") {
            row.style.backgroundColor = "#f3fff3";
          }
          else if (type == 'income') {
            row.style.backgroundColor = "#e6f7ff";
          }
          else if (type == 'growth') {
            row.style.backgroundColor = "#fff2e6";
          };

          row.appendChild(td_for_button);
          table.appendChild(row);
        });  // forEach row_data
        // allow user to add a new holding to the account in last row of table
        table.appendChild(createRowForm("", "", 0, acct_data.acctid, "Add"));
        acctDiv.appendChild(table);
        document.getElementById("accttabcontent").appendChild(acctDiv);

      });  // forEach acct_data
      // Now that we have loaded all the table data, determine which table to make active.
      // We use localstorage to store acct# if a particular tab should be activated on refresh.
      // This is the case if we just edited a particular account, for example, and refreshed.
      if (typeof(localStorage.getItem('displayAcct')) == "string" &&  localStorage.getItem('displayAcct').slice(0,4) == 'acct') {
        let a = localStorage.getItem('displayAcct');
        // localStorage.setItem('displayAcct', '');  // set so next time we don't remember tab (default to first tab)
        document.querySelector('#Tab' + a).click();
      }
      else {
        let firstTab = acct_content[acct_content.length-1].acctid;
        document.querySelector('#Tab' + firstTab).click();
      };
    }); // last .then in the fetch block
  }  // if /accounts page

  else if (window.location.pathname == "/alerts") {
    getMarket()   // update upper right time/status, on this new page
    document.querySelector("#navAlerts").classList.add("active");
  }

  else if (window.location.pathname == "/portfolio") {
    document.querySelector("#navPort").classList.add("active");
    getMarket()   // update upper right time/status, on this new page

    accum_cash = document.querySelector("#accum_cash").innerHTML;
    accum_cash = parseFloat(accum_cash);
    accum_income = document.querySelector("#accum_income").innerHTML;
    accum_income = parseFloat(accum_income);
    accum_growth = document.querySelector("#accum_growth").innerHTML;
    accum_growth = parseFloat(accum_growth);

    // paint pie chart

    var canvas = document.getElementById('piecanvas');
  // Following custom chart is from:
  // https://github.com/emn178/chartjs-plugin-labels/blob/master/README.md#chartjs-plugin-labels


    new Chart(canvas, {
  type: 'pie',
  data: {
    labels: ['Income', 'Growth', 'Cash'],
    datasets: [{
      data: [accum_income, accum_growth, accum_cash],
      backgroundColor: ['#3399ff', '#ff9933', '#00cc66']
    }],
    borderColor: 'rgb(0, 0, 0)',
    borderWidth: 1
    },
  options: {
    plugins: {
      labels: {
        // render 'label', 'value', 'percentage', 'image' or custom function, default is 'percentage'
        render: 'percentage',

        // precision for percentage, default is 0
        precision: 0,

        // identifies whether or not labels of value 0 are displayed, default is false
        showZero: true,

        // font size, default is defaultFontSize
        fontSize: 12,

        // font color, can be color array for each data or function for dynamic color, default is defaultFontColor
        fontColor: 'black',

        // font style, default is defaultFontStyle
        fontStyle: 'normal',

        // font family, default is defaultFontFamily
        fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",

        // draw text shadows under labels, default is false
        textShadow: false,

        // text shadow intensity, default is 6
        shadowBlur: 10,

        // text shadow X offset, default is 3
        shadowOffsetX: -5,

        // text shadow Y offset, default is 3
        shadowOffsetY: 5,

        // text shadow color, default is 'rgba(0,0,0,0.3)'
        shadowColor: 'rgba(255,0,0,0.75)',

        // draw label in arc, default is false
        // bar chart ignores this
        arc: false,

        // position to draw label, available value is 'default', 'border' and 'outside'
        // bar chart ignores this
        // default is 'default'
        position: 'outside',

        // draw label even it's overlap, default is true
        // bar chart ignores this
        overlap: true,

        // show the real calculated percentages from the values and don't apply the additional logic to fit the percentages to 100 in total, default is false
        showActualPercentages: true,

        // set images when `render` is 'image'
        // images: [
        //   {
        //     src: 'image.png',
        //     width: 16,
        //     height: 16
        //   }
        // ],

        // add padding when position is `outside`
        // default is 2
        outsidePadding: 0,

        // add margin of text when position is `outside` or `border`
        // default is 2
        textMargin: 4
      }
    }
  }
});


  }  // if /portfolio block end

  else if (window.location.pathname == "/settings") {
    getMarket()   // update upper right time/status, on this new page
    document.querySelector("#navSettings").classList.add("active");
};  // end of if /settings page block



// This is the 2nd place where we fetch /get_portfolio. This is the periodic fetch
// so we can dynamically update Dashboard. We get alerts, news, and price data.

  function refreshAcctData() {
      curPage = window.location.pathname;
      console.log(`time to refresh.  current page: ${curPage}`);
      if (curPage == '/dash') {   // on /dash, do periodic refreshes
        fetch('/kick_me')
        .then((resp) => resp.json())
        .then((data) => {
          console.log(`message from /kickme: ${data.message}`);
          // Now get portfolio updated data and update /dash table
          fetch('/get_portfolio')
          .then((resp) => resp.json())
          .then((data) => {

            // Pop alert items and store in browser storage alertQ
            console.log('line 701 to check for $ALERT');
            let alertQ = JSON.parse(localStorage.getItem("alertQ"));
            if (alertQ == null) {
              alertQ = [];
            };
            console.log(`alertQ prev value from localStorage= ${alertQ}`);
            console.log(`last array line = ${data[data.length - 1]}`);
            while (data[data.length -1][0] == '$ALERT') {
              console.log('line 709 We saw an $ALERT');
              alertItem = data.pop();
              alertItem.shift();    // discard the '$ALERT' symbol
              alertItem.unshift(guidGenerator()); // prepend guid
              alertQ.push(alertItem);  // put news into alertQ
            };
            if (alertQ.length > 5) {  // we'll discard anything over 5 alerts for now
              alertQ.splice(0, alertQ.length - 5);
            };
            console.log(`Here is the current alert queue:`);
            console.log(alertQ);
            localStorage.setItem("alertQ", JSON.stringify(alertQ));

            // Pop news items from server and store them in browser storage - newsQ.
            let newsQ = JSON.parse(localStorage.getItem("newsQ") || "[]");

            while (data[data.length -1][0] == '$NEWS') {
              newsItem = data.pop();
              newsItem.shift();    // discard the '$NEWS' symbol
              newsQ.unshift(newsItem);  // put news into front of the newsQ
            };
            if (newsQ.length > 100) {  // if over 100 news items, discard old ones
              newsQ.splice(100);
            };
            console.log(`Here is the current news queue:`);
            console.log(newsQ);
            localStorage.setItem("newsQ", JSON.stringify(newsQ));

            var portfolio = data;
            let origLength = portfolio.length;
            if (portfolio.length > 0) {
              let iterCount = 0;
              do {
              var l = portfolio.length;
              var i = randIndex(l);
              var portRow = portfolio[i];
              setTimeout(oneAtATime, (18000 / origLength) * iterCount, portRow);
              // evenly space out the updates based on number of assets
              // We're telling server to update all it's stocks every 30 seconds.
              // So we'll spread out our updates on client almost this long. (25 secs).
              // Doing this so user sees some update on screen frequently enough, but
              // we don't have to update and hit the server too often. The Polygon.io
              // free service will not allow us to update at a high frequency.
              function oneAtATime(portRow) {
                if (portRow[4] == 'growth' || portRow[4] == 'income') {
                  let tableBody = document.getElementById('table_container').firstChild.nextSibling.lastChild;
                  let nodes = tableBody.childNodes;
                  nodes.forEach(node => {
                    if (node.firstChild.innerHTML == portRow[0]) {   // look for match on symbol, in td[0]. if so:
                      if (portRow[1] < node.firstChild.nextSibling.innerHTML) {  // if price has gone down
                        node.firstChild.nextSibling.innerHTML = portRow[1];
                        node.firstChild.nextSibling.classList.remove('stdbgBlue', 'stdbgRed');
                        node.firstChild.nextSibling.classList.add('showRed');
                        setTimeout(function() {
                          node.firstChild.nextSibling.classList.remove('showRed');
                          let nextDoor = node.style.backgroundColor;
                          if (nextDoor == 'rgb(230, 247, 255)') {
                            node.firstChild.nextSibling.classList.add('stdbgBlue')}
                          else if (nextDoor == 'rgb(255, 242, 230)') {
                            node.firstChild.nextSibling.classList.add('stdbgRed');
                          }
                        }, 1000);
                      }

                      else if (portRow[1] > node.firstChild.nextSibling.innerHTML) {  // if price has gone up
                        node.firstChild.nextSibling.innerHTML = portRow[1];
                        node.firstChild.nextSibling.classList.remove('stdbgBlue', 'stdbgRed');
                        node.firstChild.nextSibling.classList.add('showGreen');
                        setTimeout(function() {
                          node.firstChild.nextSibling.classList.remove('showGreen');
                          let nextDoor = node.style.backgroundColor;
                          if (nextDoor == 'rgb(230, 247, 255)') {
                            node.firstChild.nextSibling.classList.add('stdbgBlue')}
                          else if (nextDoor == 'rgb(255, 242, 230)') {
                            node.firstChild.nextSibling.classList.add('stdbgRed');
                          }
                        }, 1000);
                      }
                      node.firstChild.nextSibling.nextSibling.innerHTML = portRow[2];  // update price change
                      if (portRow[2].charAt(0) == '+') {
                        node.firstChild.nextSibling.nextSibling.style.color = 'green';
                      };
                      if (portRow[2].charAt(0) == '-') {
                        node.firstChild.nextSibling.nextSibling.style.color = 'red';
                      };
                      node.firstChild.nextSibling.nextSibling.nextSibling.innerHTML = portRow[3];  // update price change pct
                      if (portRow[3].charAt(0) == '+') {
                        node.firstChild.nextSibling.nextSibling.nextSibling.style.color = 'green';
                      };
                      if (portRow[3].charAt(0) == '-') {
                        node.firstChild.nextSibling.nextSibling.nextSibling.style.color = 'red';
                      };


                      node.firstChild.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.innerHTML = portRow[6];  // value
                    }
                  });
                }    // if we're on the row for Total:
                else if (portRow[0] == 'TOTAL') {
                  let tableBody = document.getElementById('table_container').firstChild.nextSibling.lastChild;
                  let totalNode = tableBody.lastChild;
                  totalNode.firstChild.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.innerHTML = portRow[6];
                }
              }

              iterCount++;
              portfolio.splice(i, 1);  // remove asset from list
            } while (portfolio.length > 0);
            }  // if (len(portfolio)>0)
            // Finally let's update the alerts:
            updateAlerts(); // update the alerts badge and modal content
          }); // .then of second/nested fetch
        }); // .then of first fetch
        setTimeout(refreshAcctData, 20000);  // while in /dash page, run refreshAcctData every 20 secs.

        // This would be a good place to refresh Market index charts.




      };  // if curPage = /dash block
  }  // refreshAcctData function block


  setTimeout(refreshAcctData, 5000);  // One time upon DOM loaded, set refreshAcctData to run in 5 seconds.


  // document.querySelector('#exampleModal').on('show.bs.modal', function () {
  //   document.querySelector('#alertsButton').style.border = 'none';
  //   console.log("got modal event");
  // })




})   // DOMContentLoaded




function gotonewaccts() {
  window.location.href = '/add_acct';
}

function assetAddHandler(x) {
  // Here we POST additional holding for account, using /add_holding route
  console.log("assetAdd button pressed");
  console.log(event.srcElement.id);
  console.log("table ID=" + x.parentNode.parentNode.parentNode.id);
  console.log("rowIndex=" + x.parentNode.parentNode.rowIndex);
  account_ID = x.parentNode.parentNode.parentNode.id.slice(5);
  console.log(`The account id ('acct'+pk) is ${account_ID}`);
  let newSymbol = document.querySelector("#" + "Add" + "Symbol" + account_ID).value;
  console.log(`The symbol to be added is ${newSymbol}`);
  let newType = document.querySelector("#" + "Add" + "Type" + account_ID).value;
  console.log(`The type to be added is ${newType}`);
  let newQty = document.querySelector("#" + "Add" + "Qty" + account_ID).value;
  console.log(`The quantity to be added is ${newQty}`);
  let data = {acct:account_ID, symbol:newSymbol, type: newType, quantity:newQty};
  let data1 = JSON.stringify(data);
  console.log(data1);
  console.log("line before fetch");
  fetch('/add_holding', {
      method: 'POST',
      body: data1
      })

    .then( function(response) {
      console.log("sent POST");
      respstatus = response.status;
      console.log(respstatus);
      return response.json();
      })
    .then(function(result) {
      respmessage = result.error || result.success;
      console.log(respmessage);
      localStorage.setItem('displayAcct', account_ID);  // flag to reopen same acct tab
      location.reload(true);  // reload the page
      })
    .catch(error => {
      console.log(error);
    })
}

function assetEditHandler(x) {
  // If we already have been through here and painted a Submit button,
  // then that is the only allowed button press at this point.
  if ((document.documentElement.innerText).indexOf('Submit') > -1) {
    console.log("There is already a Submit");
    account_ID = x.parentNode.parentNode.parentNode.id.slice(5);
    console.log(`Account ID ('acct'+pk) is ${account_ID}`);
    // The previous symbol in the row being edited was:
    let prevSymbol = x.parentNode.parentNode.previousSibling.firstChild.innerHTML;
    console.log(`The previous symbol was ${prevSymbol}`);
    let editSymbol = document.querySelector("#" + "Submit" + "Symbol" + account_ID).value;
    console.log(`The edited symbol is ${editSymbol}`);
    let editType = document.querySelector("#" + "Submit" + "Type" + account_ID).value;
    console.log(`The edited type is ${editType}`);
    let editQty = document.querySelector("#" + "Submit" + "Qty" + account_ID).value;
    console.log(`The edited quantity is ${editQty}`);

    let data = {acct:account_ID, prevSymbol:prevSymbol, editSymbol:editSymbol, editType:editType, editQty:editQty};
    let data1 = JSON.stringify(data);
    console.log(data1);
    console.log("line before fetch in assetEditHandler");
    fetch('/edit_holding', {
        method: 'POST',
        body: data1
        })

      .then( function(response) {
        console.log("sent POST");
        respstatus = response.status;
        console.log(respstatus);
        return response.json();
        })
      .then(function(result) {
        respmessage = result.error || result.success;
        console.log(respmessage);
        localStorage.setItem('displayAcct', account_ID);  // flag to reopen same acct tab
        location.reload(true);  // reload the page
        })
      .catch(error => {
        console.log(error);
      })
  }
  // If we got here because an Edit button was pressed, then insert editing
  // row just below the row to be edited, and let user enter new values. We'll
  // paint a Submit button, which will also be flag for this function to know
  // on next button-press that edited data should be submitted.
  else {
    let symbol = x.parentNode.parentNode.firstChild.innerHTML;
    let type = x.parentNode.parentNode.firstChild.nextSibling.nextSibling.nextSibling.nextSibling.innerHTML;
    let qty = x.parentNode.parentNode.firstChild.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.innerHTML;
    account_ID = x.parentNode.parentNode.parentNode.id.slice(5);
    let newNode = createRowForm(symbol, type, qty, account_ID, "Submit");
    newNode.style.backgroundColor = "#f2f2f2";  // highlight so the edit row stands out
    newNode.style.textAlign = "right";
    x.parentNode.parentNode.parentNode.insertBefore(newNode, x.parentNode.parentNode.nextSibling);

    // and hide all the other buttons
    let aTags = document.getElementsByTagName("a");  // all our little buttons are <a> elements
    for (let i = 0; i < aTags.length; i++) {
      if (aTags[i].textContent == "Edit") {          // hide all Edit buttons
        aTags[i].style.display = "none";
      }
      else if (aTags[i].textContent == "Add") {      // hide our Add button also
        aTags[i].parentNode.parentNode.style.display = "none";  // and the entire add row!
      }
    };

  };
  return;
}

// function to create form row, which you can insert into account table
function createRowForm(symbol, type, qty, acct_id, buttonText) {

  let new_row = document.createElement('tr');

  let input0 = document.createElement("input"); // cell[0] is symbol input
  input0.style.cssFloat = "right";
  input0.setAttribute("type", "text");
  input0.setAttribute("size", "5");
  input0.setAttribute("value", symbol);
  input0.setAttribute("id", buttonText + "Symbol" + acct_id);
  let td0 = document.createElement("td");
  td0.style.textAlign = "right";
  td0.appendChild(input0);
  new_row.appendChild(td0);

  let td1 = document.createElement("td");    // cells 1, 2, 3 are blank
  new_row.appendChild(td1);
  let td2 = document.createElement("td");
  new_row.appendChild(td2);
  let td3 = document.createElement("td");
  new_row.appendChild(td3);

  let option0 = document.createElement("option");  // cell[4] is type of asset
  option0.setAttribute("value", type);               // initial option = type
  let optionText0 = document.createTextNode(type);
  option0.appendChild(optionText0);
  let inputAddType = document.createElement("select");
  inputAddType.style.cssFloat = "right";
  inputAddType.appendChild(option0);
  inputAddType.setAttribute("id", buttonText + "Type" + acct_id);
  // now we need to add two other possible types - not including above parameter
  if (type != "cash") {
    let option1 = document.createElement("option");
    option1.setAttribute("value", "cash");
    let optionText1 = document.createTextNode("cash");
    option1.appendChild(optionText1);
    inputAddType.appendChild(option1);
  };
  if (type != "income") {
    let option2 = document.createElement("option");
    option2.setAttribute("value", "income");
    let optionText2 = document.createTextNode("income");
    option2.appendChild(optionText2);
    inputAddType.appendChild(option2);
  };
  if (type != "growth") {
    let option3 = document.createElement("option");
    option3.setAttribute("value", "growth");
    let optionText3 = document.createTextNode("growth");
    option3.appendChild(optionText3);
    inputAddType.appendChild(option3);
  };
  let td4 = document.createElement("td");
  td4.style.textAlign = "right";
  td4.appendChild(inputAddType);
  new_row.appendChild(td4);

  let input2 = document.createElement("input");  // cell[5] = quantity
  input2.style.cssFloat = "right";
  input2.setAttribute("type", "number");
  input2.setAttribute("min", "0");
  input2.setAttribute("max", "100000");
  input2.setAttribute("step", "any");
  input2.setAttribute("value", qty);
  input2.setAttribute("id", buttonText + "Qty" + acct_id);
  let td5 = document.createElement("td");
  td5.style.textAlign = "right";
  td5.appendChild(input2);
  new_row.appendChild(td5);

  let td6 = document.createElement("td");   // cell[6] blank
  new_row.appendChild(td6);

  let td7 = document.createElement("td");   // cell[7] is our button!
  let td7Button = document.createElement("a");
  td7Button.setAttribute("id", buttonText + acct_id);
  if (buttonText == "Add") {
    let svgHTML = document.querySelector('.myAddSVG').cloneNode(true);
    svgHTML.style.display="inline-block";
    td7Button.appendChild(svgHTML);
    td7.appendChild(td7Button);
    td7.setAttribute("align", "center");
    new_row.appendChild(td7);
    td7Button.style.cursor = 'pointer';

    //td7Button.classList.add("badge-success", "badge");
    td7Button.setAttribute("onclick", "assetAddHandler(this)");
    return new_row;
  };
  if (buttonText == "Edit") {
    td7Button.classList.add("badge-primary", "badge");
    td7Button.setAttribute("onclick", "assetEditHandler(this)");
  };
  if (buttonText == "Submit") {
    td7Button.classList.add("badge-success", "badge");
    td7Button.setAttribute("onclick", "assetEditHandler(this)");
  };
  td7Button.appendChild(document.createTextNode(buttonText));
  td7.appendChild(td7Button);
  td7.setAttribute("align", "left");
  new_row.appendChild(td7);

  return new_row;
}

// function to create portfolio table. returns table ready to go into DOM.
// data = an array of row arrays. first row array will be heading labels.
// len of all row arrays must be same.

function build_table(data) {
  console.log("got to build_table function");
  console.log(data);
  let table = document.createElement('table');
  table.classList.add("table", "table-sm", "table-hover", "table-responsive-md");
  let tHead = document.createElement('thead');
  tHead.classList.add("thead-light");
  let headRow = document.createElement("tr");
  // headRow.classList.add("font-weight-light", "d-flex");

  let table_headings = data.shift();  // get first row-array, which is headings
  table_headings.forEach(function(hdg) {
    let headCell = document.createElement("th");
    headCell.classList.add("font-weight-light", "small");
    headCell.style.textAlign = "right";
    headCell.appendChild(document.createTextNode(hdg));
    headRow.appendChild(headCell);
  });  // forEach table heading
  tHead.appendChild(headRow);
  table.appendChild(tHead);

  let tBody = document.createElement('tbody');

  data.forEach(row_data => {
    let row = document.createElement("tr");
    // row.classList.add("d-flex");
    // for each cell:
    row_data.forEach(cell_data => {
      let cell = document.createElement("td");
      // cell.classList.add("col-sm-1");
      cell.appendChild(document.createTextNode(cell_data));
      cell.style.textAlign = "right";
      row.appendChild(cell);
      if (cell_data[0] == '+') {
        cell.style.color = "green";
        };
      if (cell_data[0] == '-') {
        cell.style.color = "red";
        };
    });  // forEach cell
    // color row depending on <td>[4] which is 'cash', 'income', or 'growth'
    let type = row.childNodes[4].innerHTML;
    if (type == "cash") {
      row.style.backgroundColor = "#f3fff3";
      row.style.transition = "backgroundColor 1s";
    }
    else if (type == 'income') {
      row.style.backgroundColor = "#e6f7ff";
      row.style.transition = "backgroundColor 1s";
    }
    else if (type == 'growth') {
      row.style.backgroundColor = "#fff2e6";
      row.style.transition = "backgroundColor 1s";
    };
    tBody.appendChild(row);
  });  // forEach row
  table.appendChild(tBody);

  return table;
}

function randIndex(l) {
  return (Math.floor(Math.random()*l));
}

// call this function to get market time and status from Polygon, update
// upper right nav bar info, and get status back. This function returns
// market status:  'open', 'closed', or 'extended-hours'

function getMarket() {
  const polykey = document.querySelector('#polykey').innerText;
  fetch('https://api.polygon.io/v1/marketstatus/now?apiKey=' + polykey)
  .then((resp) => resp.json())
  .then(data =>  {
  // console.log(`market ${data.market}`);
  // console.log(`The time is: ${data.serverTime}`);
  let dt = new Date(data.serverTime);
  dt = new Date(dt.toLocaleString("en-US", {timeZone: "America/New_York"}));
  dt = dt.toString();
  // console.log(typeof dt);
  let n = dt.indexOf("GMT");
  dt = dt.slice(4, n-4);
  dt = dt + " ET";
  document.querySelector('#timefield').innerHTML = dt;
  document.querySelector('#marketfield').innerHTML = data.market; // mkt status
  prevStatus = localStorage.getItem("marketStat");  // what was last market status?
  console.log({prevStatus});
  console.log(data.market);
  console.log(prevStatus, data.market, prevStatus == data.market);
  localStorage.setItem("marketStat", data.market); // update with new
  if (prevStatus != data.market) {
      console.log("would execute reload of page here");
      location.reload(true);  // reloading the page will force update of charts, which may not
  }                         // make sense if market has just opened and charts show prev day.

});
}

// function to search linearly through FMP bars for matching timestamp and
// return the close value.  FMP provides an array of approx. 150 records.
// Each is a JS object with attributes including date (string '2020-11-17 15:52:00')
// and close (float).  Return null if no match.
// Note if market not "open" ignore dateStr.  (just look at past day's bars)
function searchBars(dateStr, hhmmStr, data, mktIsOpen) {
  for (const record of data) {
    if (record.date.slice(0, 10) == dateStr || !mktIsOpen) {
      if (record.date.slice(11, 16) == hhmmStr)  {
        return record.close;
      }
    }
  };
  return null;  // could not find match
}

// function to search linearly through FMP bars for the record just prior to
// today's first record. That will be closing of the prior trading day. From
// that record return .close value.  If cannnot get this return null. Since market
// calendar is not something we know for sure, we do not know prior market day's
// date. So what we will do is go through records (they are in most recent first)
// for any record with a 16:00 time. Then if that has today's date, i.e. we're
// after hours of that day, we will look back for next 16:00 record and that must
// be prior trading day. But if first match does not have today's date, i.e. we
// haven't yet gotten today's 16:00 bar, then that first match must be for
// prior day's closing.
function searchYestClose(dateStr, data) {
  for (const record of data) {
    if ((record.date.slice(11, 13) == '16') && (record.date.slice(14, 16) == '00')) {
      if (record.date.slice(0,10) != dateStr) {
        return record.close;
      }
    }
  };
  return null;  // could not find match
};

//GUID generator:
function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    console.log("generated guid, line 1199");
    return ('guid' + (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4()));
};

//refreshes the modal on /dash page with alerts and sets the alerts badge
function updateAlerts() {
  let alertQ = JSON.parse(localStorage.getItem("alertQ") || "[]");  // get alerts if any
  let n = alertQ.length;
  document.querySelector('#alertsBadge').innerHTML = n;  // update the number in the badge
  if (n == 0) {      // "You have no alerts" is visible only if n=0.
    document.querySelector('#modalDefaultMessage').style.display = "inline-block";
    document.querySelector('#alertsBadge').classList.remove('badge-danger');
    document.querySelector('#alertsBadge').classList.add('badge-light');  // white badge if 0 alerts
  }
  else {
    document.querySelector('#modalDefaultMessage').style.display = "none";
    document.querySelector('#alertsBadge').classList.remove('badge-light');
    document.querySelector('#alertsBadge').classList.add('badge-danger');  // red badge if alerts
  };
  // clear any existing alert divs and then rebuild the divs
  document.querySelectorAll('.mbExcDefault').forEach(e => e.parentNode.removeChild(e));
  for (let i = 0; i < n; i++) {
    let newClone = document.querySelector('#modalAlertTemplate').cloneNode(true); // deep-clone alert body-div template
    newClone.classList.add('mbExcDefault');  // all alert divs except the template and default (no alerts) will get this class
    newClone.style.display = "inline-block"; // set it to display
    let row = alertQ[i];
    newClone.setAttribute("id", row[0]); // set id=GUID
    // console.log(`newClone= ${newClone}`);
    // console.log(`newClone classes= ${newClone.classList}`);
    // console.log(`newClone id= ${newClone.id}`);
    // console.log(`newClone.firstElementChild= ${newClone.firstElementChild}`);
    // console.log(`newClone.lastElementChild= ${newClone.lastElementChild}`);
    // console.log(`newClone.lastElementChild.firstElementChild= ${newClone.lastElementChild.firstElementChild}`);
    // console.log(`newClone.lastElementChild.firstElementChild.firstElementChild= ${newClone.lastElementChild.firstElementChild.firstElementChild}`);

    newClone.lastElementChild.firstElementChild.firstElementChild.setAttribute('id', 'd' + row[0]);  // set ID of input button
    newClone.lastElementChild.firstElementChild.firstElementChild.onclick = deleteAlert;  // may want to move this up to <label>?
    let t = document.createTextNode(row[1]) ; // row[1] is the string sent by server. use it verbatim.
    newClone.firstElementChild.firstElementChild.appendChild(t); // stick text in the <p> element
    // console.log(`newClone: ${newClone}`);
    let modalNodeAfterHeader = document.querySelector('#exampleModal').firstElementChild.firstElementChild.firstElementChild.nextElementSibling;
    let modalContentNode = document.querySelector('#exampleModal').firstElementChild.firstElementChild;
    // console.log(`to be inserted into parent: ${modalContentNode}`);
    // console.log(`before this: ${modalNodeAfterHeader}`);
    modalContentNode.insertBefore(newClone, modalNodeAfterHeader);  // and insert into modal-content, after modal-header
  };
  return;
};

// Listener for delete button in modal. User wants to delete an alert
function deleteAlert() {
  let dguid = this.id;
  // console.log(`Got button event to delete alert guid = ${dguid}`);
  let alertQ = JSON.parse(localStorage.getItem("alertQ"));
  let n = alertQ.length;
  for (let i = 0; i < n; i++) {

    let row = alertQ[i];
    // console.log(`row from alertQ: ${row}`);
    if ('d' + row[0] == dguid) {
      alertQ.splice(i, 1);
      break;
    };
  };
  localStorage.setItem("alertQ", JSON.stringify(alertQ));
  updateAlerts();   // refresh the modal content and return
  return;
}

// Sleep function. I hate to do this, but FMP returns API key error if
// we hit it too frequently, so will use this to space out requests by
// a few milliseconds.

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}
