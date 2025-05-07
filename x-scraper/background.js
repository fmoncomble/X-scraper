import { ClientTransaction } from './x-client-transaction-id/esm/mod.js';

chrome.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
        console.log('Details: ', details);
        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: 'request_headers',
                    url: details.url,
                    headers: details.requestHeaders,
                });
            }
        );
    },
    { urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'] },
    ['requestHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
    function (details) {
        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: 'response_headers',
                    headers: details.responseHeaders,
                });
            }
        );
    },
    { urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'] },
    ['responseHeaders']
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received request:', request);
    if (request.action === 'get_transaction_id') {
        let url = request.url;
        getTransactionID(url, sendResponse);
        return true;
    }
});
async function getTransactionID(url, sendResponse) {
    console.log('Fetching transaction ID...');
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(
                'Failed to fetch:',
                response.status,
                response.statusText
            );
            sendResponse({ error: 'Failed to fetch the page' });
            return;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const document = parser.parseFromString(html, 'text/html');
        console.log('Document:', document);

        if (
            !ClientTransaction ||
            typeof ClientTransaction.create !== 'function'
        ) {
            console.error('ClientTransaction is not defined or invalid');
            sendResponse({ error: 'ClientTransaction is not available' });
            return;
        }

        const transaction = new ClientTransaction(document);
        await transaction.initialize();
        const transactionId = await transaction.generateTransactionId(
            'GET',
            '/1.1/jot/client_event.json'
        );
        console.log('Generated transaction ID:', transactionId);

        if (transactionId) {
            sendResponse({ transactionId: transactionId });
        } else {
            console.error('Failed to generate transaction ID');
            sendResponse({ error: 'Failed to generate transaction ID' });
        }
    } catch (error) {
        console.error('Error generating transaction ID:', error);
        sendResponse({
            error: 'Failed to generate transaction ID',
            details: error.message,
        });
    }
}
