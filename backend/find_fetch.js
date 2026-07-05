const fs = require('fs');
const code = fs.readFileSync('../frontend/app.js', 'utf8');
const lines = code.split('\n');
lines.forEach((line, i) => {
    if (line.includes('fetch(')) {
        console.log(`${i + 1}: ${line.trim()}`);
    }
});
