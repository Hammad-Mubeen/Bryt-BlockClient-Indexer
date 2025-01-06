const Response = require("../utils/response");
const DB = require("../db");
//const UserModel = require("../db/models/user.model");
const jwt = require("jsonwebtoken");
const { AUTH_SECRET } = process.env;

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    if (token) {
      jwt.verify(token, AUTH_SECRET, async (err, decoded) => {
        if (err) {
          return Response.Send.Unauthorized(res, {
            message: "Unauthorized User",
          });
        }

        // const user = await DB.select("*")
        //   .from(`${UserModel.table}`)
        //   .where("email", decoded.email)
        //   .first();
        // if (!user) {
        //   return Response.Send.Unauthorized(res, {
        //     message: "User don't exists in the Database.",
        //   });
        // }
        // req.user = user;
        next();
      });
    } else {
      return Response.Send.Unauthorized(res, { message: "Unauthorized User." });
    }
  } else {
    return Response.Send.Unauthorized(res, { message: "Unauthorized User." });
  }
};
