/**
 * Based on a script provided by @chrisurban
 * https://github.com/chrisurban/jira-sprint-reporting/blob/master/general-query.gs
 */

var JIRA_USER = "jirausername";
var JIRA_AUTH = "seriouslysecurepassword";
var JIRA_URL = "https://jira.example.com/";

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
var IGNORE_USERS = ['archiver', 'archive', 'sysadmin', 'testguest', 'Alex', 'samantha',
                   'allie', 'jdelaigle', 'MoGillette'];

// Zivtech Holidays/PTO project ID number.
var PID_PTO = 12024;

function authenticate() {
    var params = {
        method: "get",
        accept: "application/json",
        headers: {
            "Authorization": "Basic " + Utilities.base64Encode(JIRA_USER + ":" + JIRA_AUTH)
        }
    };

    return params;
}


/**
 * @desc Helper function that makes an API call to Jira.
 * @param query (string)
 *  The API endpoint you want to hit. Include query parameters.
 * @return An object of query results.
 */
function callJira(query) {
    var data = UrlFetchApp.fetch(JIRA_URL + query, authenticate());
    data = data.getContentText();
    data = JSON.parse(data);

    return data;
}

/**
 * @desc Calls Jira to get a list of Zivtech users.
 * @return An object full of user objects
 */
function getUsers() {
    var users = callJira("rest/api/2/user/search?startAt=0&maxResults=1000&username=zivtech");

    return users;
}

/**
 * @desc Function returning yesterday's date and the date of the first day of the week.
 *  I'm using the term 'yesterday' a bit liberally here. In most cases the
 *  previous working day is the same as yesterday. The only exception is Sunday.
 * @return An object full of date objects
 */
function getDates() {
    var dates = {
        firstDayInWeek: new Date(),
        yesterday: new Date(),
    };

    dates.firstDayInWeek.setDate(dates.firstDayInWeek.getDate() - dates.firstDayInWeek.getDay());
    dates.yesterday.setDate(dates.yesterday.getDate() - 1);

    // If yesterday was Sunday, get last week's range.
    if (dates.yesterday.getDay() == 0) {
        dates.firstDayInWeek.setDate(dates.firstDayInWeek.getDate() - 6);
        dates.yesterday.setDate(dates.yesterday.getDate() - 2);
    }

    return dates;
}

/**
 * @desc Converts dates to a string that can be used in a Tempo API query.
 * @param dates (object)
 *  An object that includes any number of date objects as properties.
 * @return An object full of date strings
 */
function formatDates(dates) {
    for (var d in dates) {
        dates[d] = dates[d].toISOString().substr(0, 10);
    }

    return dates;
}

/**
 * @desc Fetch a user's worklogs and determine if they've tracked all their time.
 * @param username (string)
 *  The Jira username of the person whose time should be fetched.
 * @param dateFrom (string)
 *  The first date to collect worklogs from in yyyy-mm-dd format.
 * @param dateTo (string)
 *  The last date to collect worklogs from in yyyy-mm-dd format.
 * @return The time worked, in hours, as an integer value
 */
function getTimeTracked(username, dateFrom, dateTo) {
    var query = "dateFrom=" + dateFrom;
    query += "&dateTo=" + dateTo;
    query += "&username=" + username;

    var worklogs = callJira("rest/tempo-timesheets/3/worklogs/?" + query);
    var time = 0;

    for (n = 0; n < worklogs.length; ++n) {
        var worklog = worklogs[n];
        // Convert 8 hours PTO/Holiday worklogs to 7 hours.
        //   Zivtech tracks 8 hours for PTO/Holiday days. This decision was made
        //   to ensure payroll is accurate. This program needs to ensure a "full
        //   day" of work always equals 7 hours to properly make decisions.
        if (worklog['issue']['projectId'] === PID_PTO && worklog['timeSpentSeconds'] === 28800) {
          worklog['timeSpentSeconds'] = 25200;
        }
        var worklogTime = worklog['timeSpentSeconds'];
        time += worklogTime;
    }
    time = time / 3600;

    return time;
}

/**
 * @desc Sends an email reminding a user to track his or her time.
 * @param email (string)
 *  The email address to which the email should be sent.
 * @param dateFirst (string)
 *  The first date of the range, typically the first day of a week.
 * @param dateLast (string)
 *  The last date in the range, typically yesterday or the last day of a week.
 * @param timeTracked (int)
 *  The time the user has tracked this week.
 * @param timeRequired (int)
 *  The time the user should have tracked by the end of yesterday.
 */
function sendEmail(email, dateFirst, dateLast, timeTracked, timeRequired) {
    if (email === "jkaeser@zivtech.com") {
        var timeMissing = timeRequired - timeTracked;
        MailApp.sendEmail({
            to: email,
            subject: "You haven't tracked all your time!",
            htmlBody: 'You have tracked <strong>' + timeTracked +
                '</strong> of <strong>' + timeRequired +
                '</strong> hours so far for the period between ' + dateFirst +
                ' and ' + dateLast +
                '. That means you are missing <strong>' + timeMissing +
                '</strong> hours.<br /><br /> You say: ' +
                '<a href="https://jira.zivtech.com/secure/TempoUserBoard!timesheet.jspa">' +
                '"I\'m so sorry, I\'ll fix that right away!"</a><br /><br />' +
                '<br /><br /><br /><em>Questions about this email? Feel you ' +
                'have been wrongly accused? Ping John. He\'s responsible ' +
                'for this monster.</em>',
            noReply: true
        });
    }
}

/**
 * @desc Checks employees' tracked time and acts on findings.
 */
function checkTime() {
    var dates = getDates();
    var yesterdayDay = dates.yesterday.getDay();
    var timeRequired = 7 * (yesterdayDay);
    dates = formatDates(dates);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.clearContents();
    sheet.appendRow(['Who', 'Logged', 'All tracked?', 'Range Start', 'Range End']);

    var users = getUsers();

    for (i = 0; i < users.length; ++i) {
        var user = users[i];
        if (IGNORE_USERS.indexOf(user['name']) == -1) {
            var time = getTimeTracked(user['name'], dates.firstDayInWeek, dates.yesterday);

            if (time >= timeRequired) {
                sheet.appendRow([user['displayName'], time, 'Yes!', dates.firstDayInWeek, dates.yesterday]);
            } else if (time < timeRequired) {
                sheet.appendRow([user['displayName'], time, 'No', dates.firstDayInWeek, dates.yesterday]);
                // Don't send emails on weekends.
                if (yesterdayDay < 5) {
                    sendEmail(user['emailAddress'], dates.firstDayInWeek, dates.yesterday, time, timeRequired);
                }
            } else {
                sheet.appendRow([user['displayName'], "?", "?", dates.firstDayInWeek, dates.yesterday]);
                Logger.log("Could not determine if " + user['displayName'] + " tracked all of his or her time.");
            }
        }
    }
}
