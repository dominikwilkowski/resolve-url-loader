/*
 * MIT License http://opensource.org/licenses/MIT
 * Author: Ben Holloway @bholloway
 */
'use strict';

var path        = require('path'),
    loaderUtils = require('loader-utils');

/**
 * Create a value processing function for a given file path.
 *
 * @param {string} filename The current file being processed
 * @param {{fs:Object, debug:function|boolean, join:function, root:string}} options Options hash
 * @return {function} value processing function
 */
function valueProcessor(filename, options) {
  var URL_STATEMENT_REGEX = /(url\s*\(\s*)(?:(['"])((?:(?!\2).)*)(\2)|([^'"](?:(?!\)).)*[^'"]))(\s*\))/g,
      QUERY_REGEX         = /([?#])/g;

  var directory = path.dirname(filename),
      join      = options.join(filename, options);

  /**
   * Process the given CSS declaration value.
   *
   * @param {string} value A declaration value that may or may not contain a url() statement
   * @param {function(number):Object} getPathsAtChar Given an offset in the declaration value get a
   *  list of possible absolute path strings
   */
  return function transformValue(value, getPathsAtChar) {

    // allow multiple url() values in the declaration
    //  split by url statements and process the content
    //  additional capture groups are needed to match quotations correctly
    //  escaped quotations are not considered
    return value
      .split(URL_STATEMENT_REGEX)
      .map(initialise)
      .map(eachSplitOrGroup)
      .join('');

    /**
     * Ensure all capture group tokens are a valid string.
     *
     * @param {string|undefined} token A capture group or uncaptured token
     * @returns {string}
     */
    function initialise(token) {
      return typeof token === 'string' ? token : '';
    }

    /**
     * An Array reduce function that accumulates string length.
     */
    function accumulateLength(accumulator, element) {
      return accumulator + element.length;
    }

    /**
     * Encode the content portion of <code>url()</code> statements.
     * There are 6 capture groups in the split making every 7th unmatched.
     *
     * @param {string} element A single split item
     * @param {number} i The index of the item in the split
     * @param {Array} arr The array of split values
     * @returns {string} Every 3 or 5 items is an encoded url everything else is as is
     */
    function eachSplitOrGroup(element, i, arr) {

      // the content of the url() statement is either in group 3 or group 5
      var mod = i % 7;

      // only one of the capture groups 3 or 5 will match the other will be falsey
      if (element && ((mod === 3) || (mod === 5))) {

        // calculate the offset of the match from the front of the string
        var position = arr.slice(0, i - mod + 1).reduce(accumulateLength, 0);

        // detect quoted url and unescape backslashes
        var before    = arr[i - 1],
            after     = arr[i + 1],
            isQuoted  = (before === after) && ((before === '\'') || (before === '"')),
            unescaped = isQuoted ? element.replace(/\\{2}/g, '\\') : element;

        // split into uri and query/hash and then find the absolute path to the uri
        //  construct iterator as late as possible in case sourcemap is invalid at this location
        var split    = unescaped.split(QUERY_REGEX),
            uri      = split[0],
            query    = split.slice(1).join(''),
            absolute = testIsRelative(uri) && join(uri, getPathsAtChar(position)) ||
                       testIsAbsolute(uri) && join(uri, null);

        // default to initialised else path relative to the processed file
        if (!absolute) {
          return element;
        } else {
          return loaderUtils.urlToRequest(
            path.relative(directory, absolute).replace(/\\/g, '/') + query // #6 - backslashes are not legal in URI
          );
        }
      }
      // everything else, including parentheses and quotation (where present) and media statements
      else {
        return element;
      }
    }
  };

  /**
   * The loaderUtils.isUrlRequest() doesn't support windows absolute paths on principle. We do not subscribe to that
   * dogma so we add path.isAbsolute() check to allow them.
   *
   * We also eliminate module relative (~) paths.
   *
   * @param {string|undefined} uri A uri string possibly empty or undefined
   * @return {boolean} True for relative uri
   */
  function testIsRelative(uri) {
    return !!uri && loaderUtils.isUrlRequest(uri, false) && !path.isAbsolute(uri) && (uri.indexOf('~') !== 0);
  }

  /**
   * The loaderUtils.isUrlRequest() doesn't support windows absolute paths on principle. We do not subscribe to that
   * dogma so we add path.isAbsolute() check to allow them.
   *
   * @param {string|undefined} uri A uri string possibly empty or undefined
   * @return {boolean} True for absolute uri
   */
  function testIsAbsolute(uri) {
    return !!uri && (typeof options.root === 'string') && loaderUtils.isUrlRequest(uri, options.root) &&
      (/^\//.test(uri) || path.isAbsolute(uri));
  }
}

module.exports = valueProcessor;
