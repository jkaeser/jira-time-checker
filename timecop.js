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
var ignoreUsers = ['archive', 'sysadmin', 'testguest', 'Alex', 'samantha', 'allie', 'jdelaigle', 'MoGillette'];

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
  } else {
    if (yesterday.getDay() == 0) {
    yesterday.setDate(yesterday.getDate() - 2);
    }
    // Format to work in Jira filter.
    yesterday = yesterday.toISOString().substr(0,10);
  }

  return yesterday;
}

/**
 * Fetch a user's worklogs and determine if they've tracked all their time.
 *
 * @param username
 *  The Jira username of the person whose time should be fetched.
 */
function getTimeTracked(username) {
  var yesterday = getYesterday();
  if (yesterday) {
    // Get tracked time. Assume guilty until proven innocent.
    var query = "dateFrom=" + yesterday;
    query += "&dateTo=" + yesterday;
    query += "&username=" + username;
    var worklogs = callJira("rest/tempo-timesheets/3/worklogs/?" + query);
    var time = {isTimeTracked: false, totalTime: 0};

    // Sum up total time and act on findings.
    for (n = 0; n < worklogs.length; ++n) {
      var worklog = worklogs[n];
      var worklogTime = worklog['timeSpentSeconds'];
      time.totalTime += worklogTime;
    }
    time.totalTime = time.totalTime / 3600;
    if (time.totalTime >= 6.95) {
      time.isTimeTracked = true;
    }
    return time;
  }
}

/**
 * Sends an email reminding a user to track his or her time.
 *
 * @param email
 *  The email address to which the email should be sent.
 */
function sendEmail(email) {
  MailApp.sendEmail({
    to: email,
    subject: "You didn't track all your time yesterday!",
    htmlBody: 'Tsk tsk. Go finish up, you sinner.<br /><br />' +
    'You say: <a href="https://jira.zivtech.com/secure/TempoUserBoard!timesheet.jspa">"I\'m so sorry, I\'ll do that right away!"<br />',
    noReply: true
  });
}

/**
 * Function checking tracked time and acting on its findings.
 */
function checkTime() {

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.clearContents();

  var users = getUsers();

  for (i = 0; i < users.length; ++i) {
    var user = users[i];
    if (ignoreUsers.indexOf(user['name']) == -1) {
      var time = getTimeTracked(user['name']);
      if (time.isTimeTracked) {
        sheet.appendRow([user['displayName'], time.totalTime, 'Yes!']);
      } else if (time.isTimeTracked === false) {
        sheet.appendRow([user['displayName'], time.totalTime, 'No']);
        sendEmail(user['emailAddress']);
      } else {
        Logger.log("Could not determine if " + user['displayName'] + " tracked all of his or her time.")
      };
    };
  };
}
