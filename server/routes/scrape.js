const express = require('express');
const app = express();
const router = express.Router();
const scrapeXML = require('../controllers/scrapeXML');

router.post('/scrape', scrapeXML);

module.exports = router;