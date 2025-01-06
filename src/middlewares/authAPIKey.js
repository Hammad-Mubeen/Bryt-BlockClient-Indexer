const Response = require("../utils/response");
const { createHash } = require("crypto");
const { AUTH_API_KEY_HASH } = process.env;

module.exports = async (req, res, next) => {
  const authHeader = req.headers['x-api-key'];
  if(authHeader == null)
  {
    return Response.Send.Unauthorized(res, {
      message: "api_key has not been passed.",
    });
  }
  else{
    var hash = createHash('sha256').update(authHeader).digest('hex');
    if(hash != AUTH_API_KEY_HASH)
    {
      return Response.Send.Unauthorized(res, {
        message: "api_key not matched.",
      });
    }
    next();
  }
};
