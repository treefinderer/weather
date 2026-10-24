// JavaScriptCore parse check, run with: osascript -l JavaScript parse_check.js <file.js>
// Prints "OK" or the syntax error. Exits non-zero (via thrown error) when the file doesn't parse.
ObjC.import('Foundation');
function run(argv) {
  var path = argv[0];
  var src = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if (!src || src.isNil()) throw new Error('could not read ' + path);
  new Function(src.js);
  return 'OK';
}
