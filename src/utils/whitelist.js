const _isInteger =
  Number.isInteger ||
  function (n) {
    return n << 0 === n;
  };

const _isString = (x) => Object.prototype.toString.call(x) === "[object String]";

const _isArray = Array.isArray;

const _has = (prop, obj) => Object.prototype.hasOwnProperty.call(obj, prop);

const isNil = (x) => x == null;

const path = (pathAr, obj) => paths([pathAr], obj)[0];

const nth = (offset, list) => {
  const idx = offset < 0 ? list.length + offset : offset;
  return _isString(list) ? list.charAt(idx) : list[idx];
};

const paths = (pathsArray, obj) => {
  return pathsArray.map(function (paths) {
    let val = obj;
    let idx = 0;
    let p;
    while (idx < paths.length) {
      if (val == null) {
        /* eslint-disable-next-line  */
        return;
      }
      p = paths[idx];
      val = _isInteger(p) ? nth(p, val) : val[p];
      idx += 1;
    }
    return val;
  });
};

const assoc = (prop, val, obj) => {
  const result = {};
  for (const p in obj) {
    result[p] = obj[p];
  }
  result[prop] = val;
  return result;
};

const assocPath = (path, val, obj) => {
  if (path.length === 0) {
    return val;
  }
  const idx = path[0];
  if (path.length > 1) {
    const nextObj =
      !isNil(obj) && _has(idx, obj) ? obj[idx] : _isInteger(path[1]) ? [] : {};
    val = assocPath(Array.prototype.slice.call(path, 1), val, nextObj);
  }
  if (_isInteger(idx) && _isArray(obj)) {
    const arr = [].concat(obj);
    arr[idx] = val;
    return arr;
  } else {
    return assoc(idx, val, obj);
  }
};

const whitelist = (obj, paths) => {
  if (Array.isArray(obj)) {
    return obj.map((o) => whitelist(o, paths));
  }
  let data = {};

  paths.forEach((p) => {
    const pArr = p.match(/(\w+)/g);
    const val = path(pArr, obj);
    if (typeof val !== "undefined") {
      data = assocPath(pArr, val, data);
    }
  });
  return data;
};

module.exports = whitelist;
