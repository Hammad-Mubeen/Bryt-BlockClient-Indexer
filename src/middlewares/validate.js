const Joi = require("joi");
const HTTP = require("../utils/httpCodes");
const { pick } = require("../utils/ramda");

const validate = (schema) => (req, res, next) => {
  const validSchema = pick(schema, ["params", "query", "body"]);
  const object = pick(req, Object.keys(validSchema));
  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: "key" } })
    .validate(object);
  if (error) {
    return res.status(HTTP.BadRequest).send({
      message: error["details"][0]["message"],
    });
  }
  Object.assign(req, value);
  return next();
};

module.exports = validate;
