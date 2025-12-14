// test_parsebot.js - Test parse.bot API directly
import axios from 'axios';

const url = "https://api.parse.bot/scraper/dc8d000f-49f1-4d97-b357-9b0c4e5c5c07/get_user_videos";

const payload = {
    count: "50",
    username: "clpnverse"
};

const headers = {
    "Content-Type": "application/json",
    "X-API-Key": "618ff0c2-c8cd-4c3c-85aa-26aa50e4a169"
};

console.log('Testing parse.bot API...');
console.log('URL:', url);
console.log('Payload:', payload);

try {
    const response = await axios.post(url, payload, { headers, timeout: 60000 });
    console.log('\nStatus:', response.status);
    console.log('\nResponse keys:', Object.keys(response.data));
    console.log('\nFull response (first 2000 chars):');
    console.log(JSON.stringify(response.data, null, 2).substring(0, 2000));
} catch (error) {
    console.log('Error:', error.response?.data || error.message);
}
