// Set this to your tab's name (shown at the bottom of the sheet)
const SHEET_NAME = 'Sheet1';

// Column F holds the job URL (Date, Company, Role, Location, Source, URL, Status, Notes)
const URL_COLUMN = 6;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ ok: false, error: 'invalid request: empty body' });
    }

    const d = JSON.parse(e.postData.contents);

    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || d.token !== secret) {
      return respond({ ok: false, error: 'unauthorized' });
    }

    if (!d.url || !String(d.url).trim()) {
      return respond({ ok: false, error: 'invalid request: url is required' });
    }

    const result = processData(d);
    return respond({ ok: true, result: result });

  } catch (err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function processData(d) {
  // Lock so two quick submissions can't both pass the duplicate check
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error('Sheet tab "' + SHEET_NAME + '" not found');
    }

    const url = String(d.url).trim();

    // Duplicate check on the URL column (skip the header row)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existing = sheet
        .getRange(2, URL_COLUMN, lastRow - 1, 1)
        .getValues()
        .flat()
        .map(function (v) { return String(v).trim(); });

      if (existing.includes(url)) {
        return 'duplicate';
      }
    }

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    sheet.appendRow([
      today,
      d.company || 'Unknown',
      d.role || 'Unknown',
      d.location || 'Unknown',
      d.source || 'Unknown',
      url,
      d.status || 'Applied',
      d.notes || ''
    ]);

    return 'added';

  } finally {
    lock.releaseLock();
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}