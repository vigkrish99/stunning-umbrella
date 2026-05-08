/**
 * Extract response bodies from Newman JSON output
 * and save them as individual files for analysis
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../data/trackabout/newman-full-output.json');
const OUTPUT_DIR = path.join(__dirname, '../data/trackabout');

const newmanOutput = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 EXTRACTING TRACKABOUT RESPONSE DATA');
console.log('═══════════════════════════════════════════════════════════\n');

const executions = newmanOutput.run.executions;

executions.forEach((exec, index) => {
  const name = exec.item.name;
  const response = exec.response;
  
  if (response && response.stream) {
    // Convert stream buffer to string
    const bodyBuffer = Buffer.from(response.stream.data);
    const bodyString = bodyBuffer.toString('utf8');
    
    try {
      const bodyJson = JSON.parse(bodyString);
      const filename = `${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.json`;
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, filename),
        JSON.stringify(bodyJson, null, 2)
      );
      
      // Log summary
      console.log(`✅ ${name}`);
      if (bodyJson.totalRows !== undefined) {
        console.log(`   Records: ${bodyJson.totalRows}`);
      } else if (bodyJson.rows) {
        console.log(`   Records: ${bodyJson.rows.length}`);
      }
      
      // Show structure
      const keys = Object.keys(bodyJson);
      console.log(`   Keys: ${keys.join(', ')}`);
      
      if (bodyJson.rows && bodyJson.rows.length > 0) {
        const sampleKeys = Object.keys(bodyJson.rows[0]);
        console.log(`   Row fields: ${sampleKeys.join(', ')}`);
      }
      console.log('');
      
    } catch (e) {
      console.log(`❌ ${name}: Failed to parse JSON`);
    }
  }
});

console.log('═══════════════════════════════════════════════════════════');
console.log('✅ All response data extracted to:', OUTPUT_DIR);
console.log('═══════════════════════════════════════════════════════════');
