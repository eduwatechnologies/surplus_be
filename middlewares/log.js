module.exports = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      ip: req.headers["x-forwarded-for"] || req.ip,
      ua: req.headers["user-agent"],
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      userId: req.user?._id || req.staff?._id || null,
    }));
  });
  next();
};
