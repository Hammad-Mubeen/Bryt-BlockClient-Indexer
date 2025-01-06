/**
 * Create an object composed of the picked object properties
 * @param {Object} object
 * @param {string[]} keys
 * @returns {Object}
 */
const pick = (object, keys) => {
  return keys.reduce((obj, key) => {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      // eslint-disable-next-line no-param-reassign
      obj[key] = object[key];
    }
    return obj;
  }, {});
};

const isEmpty = (obj) =>
  [Object, Array].includes((obj || {}).constructor) && !Object.entries(obj || {}).length;

/**
 * Takes in a {key:val} and returns a key:key
 *
 * @param object {key1 : val1 ... keyn:valn}
 */
const keyMirror = (obj) => {
  let key;
  const mirrored = {};

  if (obj && typeof obj === "object") {
    for (key in obj) {
      /* eslint-disable-next-line  */
      if (obj.hasOwnProperty(key)) {
        mirrored[key] = key;
      }
    }
  }
  return mirrored;
};

const get = (obj, path, defaultValue = undefined) => {
  const travel = (regexp) =>
    String.prototype.split
      .call(path, regexp)
      .filter(Boolean)
      .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj);
  const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
  return result === undefined || result === obj ? defaultValue : result;
};

module.exports = {
  pick,
  isEmpty,
  keyMirror,
  get,
};
