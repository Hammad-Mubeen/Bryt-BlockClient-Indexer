const HTTP = require("./httpCodes");

const Send = (res, status, body = null) => res.status(status).send(body);

const ErrorBody = (message, errors) => {
  if (Object.keys(errors).length === 0 && errors.constructor === Object) {
    return { message };
  }
  return { message, errors };
};

module.exports = {
  ErrorBody,
  Send: {
    Raw: (res, status, body) => Send(res, status, body),
    // 200
    Success: (res, body) => Send(res, HTTP.Success, body),
    // 201
    Created: (res, body) => Send(res, HTTP.Created, body),
    // 204
    SuccessNoContent: (res) => Send(res, HTTP.SuccessNoContent),
    // 400
    BadRequest: (res, errBody) => Send(res, HTTP.BadRequest, errBody),
    // 401
    Unauthorized: (res, errBody) => Send(res, HTTP.Unauthorized, errBody),
    // 403
    Forbidden: (res, errBody) => Send(res, HTTP.Forbidden, errBody),
    // 404
    NotFound: (res, errBody) => Send(res, HTTP.NotFound, errBody),
    // 422
    Unprocessable: (res, errBody) => Send(res, HTTP.Unprocessable, errBody),
    // 500
    ServerError: (res, errBody) => Send(res, HTTP.ServerError, errBody),
  },
};
