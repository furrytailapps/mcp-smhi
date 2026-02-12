// Comprehensive test script for all SMHI MCP tools
const http = require('http');
const https = require('https');

// Allow testing against production via MCP_URL env var
const MCP_URL = process.env.MCP_URL || 'http://localhost:3000/mcp';
const parsedUrl = new URL(MCP_URL);
const isHttps = parsedUrl.protocol === 'https:';
const httpModule = isHttps ? https : http;

function parseSSE(sseText) {
  const lines = sseText.split('\n');
  let data = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      data += line.substring(6);
    }
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

async function testMCP(method, params = {}) {
  const data = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  });

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Accept': 'application/json, text/event-stream',
    },
  };

  return new Promise((resolve, reject) => {
    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const parsed = parseSSE(body);
        if (parsed) {
          resolve(parsed);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ rawBody: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Comprehensive SMHI MCP Server Test');
  console.log(`URL: ${MCP_URL}\n`);
  const results = { passed: 0, failed: 0, tests: [] };

  function recordTest(name, passed, details = '') {
    results.tests.push({ name, passed, details });
    if (passed) {
      results.passed++;
      console.log(`   OK ${name} ${details}`);
    } else {
      results.failed++;
      console.log(`   FAILED ${name} ${details}`);
    }
  }

  // Test 1: Initialize
  console.log('1. Testing MCP initialization...');
  try {
    const initResult = await testMCP('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'comprehensive-test', version: '1.0.0' },
    });
    recordTest('Initialize', !!initResult.result?.serverInfo, `(server: ${initResult.result?.serverInfo?.name || 'unknown'})`);
  } catch (error) {
    recordTest('Initialize', false, `(error: ${error.message})`);
  }

  // Test 2: List tools (should be exactly 4)
  console.log('\n2. Testing tools/list...');
  try {
    const toolsResult = await testMCP('tools/list');
    const toolCount = toolsResult.result?.tools?.length || 0;
    recordTest('List tools', toolCount === 4, `(found ${toolCount}/4 tools)`);
  } catch (error) {
    recordTest('List tools', false, `(error: ${error.message})`);
  }

  // ============ smhi_describe_data ============
  console.log('\n3. Testing smhi_describe_data...');

  // 3a: List kommuner
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_describe_data',
      arguments: { dataType: 'kommuner' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest(
      'Describe data - kommuner',
      data.kommuner?.length > 0 || data.count > 0,
      `(found ${data.count || data.kommuner?.length || 0})`,
    );
  } catch (error) {
    recordTest('Describe data - kommuner', false, `(error: ${error.message})`);
  }

  // 3b: List län
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_describe_data',
      arguments: { dataType: 'lan' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Describe data - län', data.lan?.length > 0 || data.count > 0, `(found ${data.count || data.lan?.length || 0})`);
  } catch (error) {
    recordTest('Describe data - län', false, `(error: ${error.message})`);
  }

  // 3c: List stations
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_describe_data',
      arguments: { dataType: 'met_stations' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest(
      'Describe data - stations',
      data.stations?.length > 0 || data.count > 0,
      `(found ${data.count || data.stations?.length || 0})`,
    );
  } catch (error) {
    recordTest('Describe data - stations', false, `(error: ${error.message})`);
  }

  // ============ smhi_get_forecast ============
  console.log('\n4. Testing smhi_get_forecast...');

  // 4a: Forecast by coordinates
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_forecast',
      arguments: { latitude: 59.33, longitude: 18.07 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Forecast - by coordinates', data.forecast || data.timeSeries || !data.error, '(Stockholm)');
  } catch (error) {
    recordTest('Forecast - by coordinates', false, `(error: ${error.message})`);
  }

  // 4b: Forecast by kommun code
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_forecast',
      arguments: { kommun: '0180' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Forecast - by kommun', data.forecast || data.timeSeries || !data.error, '(kommun=0180)');
  } catch (error) {
    recordTest('Forecast - by kommun', false, `(error: ${error.message})`);
  }

  // 4c: Forecast by län code
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_forecast',
      arguments: { lan: 'AB' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Forecast - by län', data.forecast || data.timeSeries || !data.error, '(län=AB)');
  } catch (error) {
    recordTest('Forecast - by län', false, `(error: ${error.message})`);
  }

  // ============ smhi_get_observations ============
  console.log('\n5. Testing smhi_get_observations...');

  // 5a: Meteorological observations
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_observations',
      arguments: {
        dataType: 'meteorological',
        kommun: '0180',
        parameter: 'temperature',
        period: 'latest-hour',
      },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Observations - meteorological', data.observations || data.station || !data.error, '(temperature)');
  } catch (error) {
    recordTest('Observations - meteorological', false, `(error: ${error.message})`);
  }

  // 5b: Hydrological observations
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_observations',
      arguments: {
        dataType: 'hydrological',
        kommun: '0180',
        parameter: 'water_level',
        period: 'latest-day',
      },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    // Hydro stations might not be available in all areas
    recordTest(
      'Observations - hydrological',
      data.observations !== undefined || data.station || data.code === 'NOT_FOUND' || !data.error,
      '(water_level)',
    );
  } catch (error) {
    recordTest('Observations - hydrological', false, `(error: ${error.message})`);
  }

  // ============ smhi_get_current_conditions ============
  console.log('\n6. Testing smhi_get_current_conditions...');

  // 6a: Weather warnings
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_current_conditions',
      arguments: { conditionType: 'warnings' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest(
      'Current conditions - warnings',
      data.warnings !== undefined || !data.error,
      `(found ${data.count || 0} warnings)`,
    );
  } catch (error) {
    recordTest('Current conditions - warnings', false, `(error: ${error.message})`);
  }

  // 6b: Radar
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_current_conditions',
      arguments: { conditionType: 'radar', format: 'png' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Current conditions - radar', data.url || data.imageData || !data.error, '');
  } catch (error) {
    recordTest('Current conditions - radar', false, `(error: ${error.message})`);
  }

  // 6c: Lightning
  try {
    const result = await testMCP('tools/call', {
      name: 'smhi_get_current_conditions',
      arguments: { conditionType: 'lightning', date: 'latest' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest(
      'Current conditions - lightning',
      data.strikes !== undefined || !data.error,
      `(found ${data.count || 0} strikes)`,
    );
  } catch (error) {
    recordTest('Current conditions - lightning', false, `(error: ${error.message})`);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  - ${t.name} ${t.details}`);
      });
    process.exit(1);
  }

  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
