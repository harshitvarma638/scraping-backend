const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;
app.use(cors());
app.use(express.json());

const scrape = require('./routes/scrape');
app.use('/', scrape);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
