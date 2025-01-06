const errorMiddleware = (error, req, res, next) => {
  if (error.errors) {
    return res.status(500).json({ message: "INTERNAL SERVER ERROR" });
  }

  return res.status(error.code || error.status || 500).json({
    message:
      error.message ||
      error.error ||
      error.name ||
      error ||
      "INTERNAL SERVER ERROR",
  });
};

module.exports = errorMiddleware;
