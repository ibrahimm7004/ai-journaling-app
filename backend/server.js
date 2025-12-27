const dotenv = require('dotenv');
const app = require('./app');
require('./db');

dotenv.config({ path: './config.env' });

const port = process.env.PORT || 4000;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`App running on port ${port}...`);
  });
}