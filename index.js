require("dotenv").config();
const path = require("path");
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
var i18n = require("i18n");
const createError = require("http-errors");

const busboy = require('connect-busboy');


const route = require("./app/routers")
const errorMiddleware = require("./app/middlewares/error");
const { Database } = require("./app/helpers");
Database.connect(process.env.DB_URL);

i18n.configure({
    locales:['vi', 'en'],
    defaultLocale: 'vi',
    directory: path.join(__dirname, '/app/languages'),
    cookie: 'lang',
    updateFiles: true
});

const app = express();
app.use('/media',express.static(path.join(__dirname, '/media')));
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(cookieParser());
app.use(i18n.init)

app.use(busboy({
    highWaterMark: 1024 * 1024 * 1024,
}));

app.use(cors());
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Credentials", true);
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  res.header(
    "Access-Control-Allow-Headers",
    "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept"
  );
  if ("OPTIONS" == req.method) {
    res.send(200);
  } else {
    next();
  }
});
app.use(morgan('combined'));

app.get('/' , async (req, res, next) => {
    res.send(req.__('Welcome Library Media ChoNhanh.vn'));
})
app.use('/change-lang/:lang', (req, res) => { 
    res.cookie('lang', req.params.lang, { maxAge: 900000 });
    res.redirect('back');
});

route(app);
app.use(errorMiddleware);

const PORT = process.env.PORT || 1898;
app.use(async (req, res, next) => { next(createError.NotFound()); });
app.use((err, req, res, next) => {  res.status(err.status || 500); res.send({ success: false, message: err.message}); });

const server = app.listen(PORT, () => { 
    console.log(`Server is working on http://localhost:${PORT}`);
});
process.on("unhandledRejection", (err) => {
    console.log(`Error: ${err.message}`);
    console.log(`Shutting down the server due to Unhandled Promise Rejection`);
    server.close(() => {  process.exit(1) });
});