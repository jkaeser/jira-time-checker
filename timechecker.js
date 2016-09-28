/**
 * Original script provided by @chrisurban
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
  // Get yesterday's date.
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  // Format to work in Jira filter.
  yesterday = yesterday.toISOString().substr(0,10);

  return yesterday;
}

function getTimeTracked() {
  var yesterday = getYesterday();
  var users = getUsers();

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.clearContents();

  for (i = 0; i < users.length; ++i) {
    var user = users[i];
    if (user['name'] != 'archive' && user['name'] != 'sysadmin' && user['name'] != 'testguest') {
      var username = user['name'];
      var displayName = user['displayName'];
      var isTimeTracked = "No";
      var totalTime = 0;

      // Build query details
      var query = "dateFrom=" + yesterday;
      query += "&dateTo=" + yesterday;
      query += "&username=" + username;

      // Get worklog details
      var worklogs = callJira("rest/tempo-timesheets/3/worklogs/?" + query);

      // Sum up the individual worklogs.
      for (n = 0; n < worklogs.length; ++n) {
        var worklog = worklogs[n];
        var time = worklog['timeSpentSeconds'];
        totalTime += time;
      }

      // Convert total time to hours and check if all time was entered.
      totalTime = totalTime / 3600;
      if (totalTime >= 6.95) {
        isTimeTracked = 'Yes!';
      }

      // Print findings to a new row.
      sheet.appendRow([displayName, totalTime, isTimeTracked]);
    };
  };
}
