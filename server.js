const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const staticPath = process.env.STATIC_PATH || path.join(__dirname, 'build');
app.use(express.static(staticPath));
app.get('*', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));
app.listen(PORT, () => console.log(`[Dashboard] Sovereign console on port ${PORT}`));