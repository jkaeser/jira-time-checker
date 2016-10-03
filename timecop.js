/**
 * Based on a script provided by @chrisurban
 * https://github.com/chrisurban/jira-sprint-reporting/blob/master/general-query.gs
 */

var jirauser = "john";
var jiraauth = "i7!1a@8KEmzC3CJz";
var jiraurl  = "https://jira.zivtech.com/";

// Authenticate against Jira.
function authenticate() {
  var params = {
    method : "get",
    accept : "application/json",
      headers: {"Authorization" : "Basic " + Utilities.base64Encode( jirauser + ":" + jiraauth )}
  };

  return params;
}

/**
 * Helper function that makes an API call to Jira.
 *
 * @param query
 *  The API endpoint you want to hit with query params.
 */

function callJira(query) {
  var data = UrlFetchApp.fetch( jiraurl + query, authenticate() );
  data = data.getContentText();
  data = JSON.parse(data);

  return data;
}

function getUsers() {
  var zivtechUsers = [];
  var users = callJira("rest/api/2/user/search?startAt=0&maxResults=1000&username=zivtech");

  return users;
}

function getYesterday() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (yesterday.getDay() >= 5) {
    yesterday = false;
  } else {
    // Format to work in Jira filter.
    yesterday = yesterday.toISOString().substr(0,10);
  }
  return yesterday;
}

/**
 * @TODO: Break apart into discrete functions
 */
function getTimeTracked() {
  var yesterday = getYesterday();
  if (yesterday) {
    var users = getUsers();

    // First clean up the sheet from the previous day.
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.clearContents();

    for (i = 0; i < users.length; ++i) {
      var user = users[i];
      if (user['name'] != 'archive' && user['name'] != 'sysadmin' && user['name'] != 'testguest') {

        // Set variables to make it easier to ask for things.
        var username = user['name'];
        var displayName = user['displayName'];
        var email = user['emailAddress'];
        var query = "dateFrom=" + yesterday;
        query += "&dateTo=" + yesterday;
        query += "&username=" + username;

        // Get tracked time. Assume guilty until proven innocent.
        var worklogs = callJira("rest/tempo-timesheets/3/worklogs/?" + query);
        var isTimeTracked = "No";
        var totalTime = 0;

        for (n = 0; n < worklogs.length; ++n) {
          var worklog = worklogs[n];
          var time = worklog['timeSpentSeconds'];
          totalTime += time;
        }

        totalTime = totalTime / 3600;
        if (totalTime >= 6.95) {
          isTimeTracked = 'Yes!';
        }

        // @TODO: don't send emails to certain people. Perhaps build an array up top? Or make configurable in Jira?
        // Print findings to a new row.
        sheet.appendRow([displayName, totalTime, isTimeTracked]);
        if (email == 'jkaeser@zivtech.com') {
          MailApp.sendEmail({
            to: email,
            subject: "You didn't track all your time yesterday!",
            htmlBody: 'Tsk tsk. Go finish up, you sinner.<br /><br />' +
            'You say: <a href="https://jira.zivtech.com/secure/TempoUserBoard!timesheet.jspa">"I\'m so sorry, I\'ll do that right away!"<br />',
            noReply: true
          });
        };
      };
    };
  };
}
