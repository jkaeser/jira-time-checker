/**
 * Based on a script provided by @chrisurban
 * https://github.com/chrisurban/jira-sprint-reporting/blob/master/general-query.gs
 */

var jirauser = "john";
var jiraauth = "i7!1a@8KEmzC3CJz";
var jiraurl  = "https://jira.zivtech.com/";

/**
 *  Users included in this array will be ignored by the script. Their time will
 *  not be checked. They will not receive emails if they do not track all of
 *  their time.
 *
 ********************************
 *  TO IGNORE A USER:
 ********************************
 *   Include the person's Jira username (not email, not full name) in the array
 *   below. Usernames can be found in the Jira user browser. You need sufficient
 *   Jira permissions to access this page.
 *   https://jira.zivtech.com/secure/admin/user/UserBrowser.jspa
 */
var ignoreUsers = ['archive', 'sysadmin', 'testguest', 'Alex', 'samantha', 'allie'];

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
 *  The API endpoint you want to hit. Include query parameters.
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

/**
 * Function returning the previous working day.
 *
 * I'm using the term 'yesterday' a bit liberally here. In most cases the
 * previous working day is the same as yesterday. The only exception is Sunday.
 */
function getYesterday() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (yesterday.getDay() >= 5) {
    yesterday = false;
  } else if(yesterday.getDay() == 0) {
    yesterday.setDate(yesterday.getDate() - 2);
  } else {
    // Format to work in Jira filter.
    yesterday = yesterday.toISOString().substr(0,10);
  }

  return yesterday;
}

/**
 * Function checking tracked time and acting on its findings.
 *
 * @TODO: Break apart into discrete functions with one job per function.
 */
function getTimeTracked() {
  var yesterday = getYesterday();
  if (yesterday) {
    // At this point, clear old data out of spreadsheet.
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.clearContents();

    var users = getUsers();
    for (i = 0; i < users.length; ++i) {
      var user = users[i];
      if (ignoreUsers.indexOf(user['name']) == -1) {
        var query = "dateFrom=" + yesterday;
        query += "&dateTo=" + yesterday;
        query += "&username=" + user['name'];

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

        // Print findings to a new row.
        sheet.appendRow([user['displayName'], totalTime, isTimeTracked]);

        // Send email if time not tracked
        if (user['emailAddress'] == 'jkaeser@zivtech.com') {
          MailApp.sendEmail({
            to: user['emailAddress'],
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
