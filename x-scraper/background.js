let port;

const manifest = chrome.runtime.getManifest();
const origins = manifest.host_permissions;
async function checkPermissions() {
	return new Promise(async (resolve) => {
		console.log('Checking permissions: ', origins);
		const hasPermissions = await chrome.permissions.contains({ origins });
		if (!hasPermissions) {
			resolve(false);
		} else {
			resolve(true);
		}
	});
}
chrome.action.onClicked.addListener(async (tab) => {
	const granted = await chrome.permissions.request({ origins });
	if (granted) {
		if (!tab.url.includes('x.com/search?')) {
			if (tab.url.includes('x.com')) {
				chrome.scripting.executeScript({
					target: { tabId: tab.id },
					func: () => {
						window.alert(
							'Please perform a search before you start scraping.',
						);
						if (window.location.href !== 'https://x.com/search-advanced') {
							window.location.href = 'https://x.com/search-advanced';
						}
					},
				});
			} else {
				chrome.tabs.create({
					url: 'https://x.com/search-advanced',
				});
			}
		} else {
			port.postMessage({ action: 'scrape' });
		}
	} else {
		console.log('Permission denied');
	}
});

chrome.webRequest.onHeadersReceived.addListener(
	function (details) {
		if (port) {
			port.postMessage({
				message: 'response_headers',
				headers: details.responseHeaders,
				status: details.statusCode,
			});
		}
	},
	{ urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'] },
	['responseHeaders'],
);

let scraping = false;
let tweets = [];
let demand;
let i = 1;
chrome.runtime.onConnect.addListener(handlePort);
async function handlePort(p) {
	tweets = [];
	port = p;
	port.postMessage({ message: 'connected' });
	const pingInterval = setInterval(() => {
		if (port.sender) {
			port.postMessage({ message: 'ping' });
		} else {
			console.log('No sender, clearing interval');
			clearInterval(pingInterval);
		}
	}, 10000);
	port.onDisconnect.addListener((p) => {
		console.log('Port disconnected', p);
		tweets = [];
		scraping = false;
		chrome.storage.local.remove(['tweets']);
		chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
		chrome.webRequest.onBeforeRequest.removeListener(firstListener);
		clearInterval(pingInterval);
	});
	port.onMessage.addListener(async (request) => {
		chrome.storage.local.get(['tweets'], function (result) {
			if (result.tweets && result.tweets.length) {
				tweets = result.tweets;
			} else {
				tweets = [];
			}
		});
		i = 1;
		demand = request;
		if (request.message === 'get_first_results') {
			scraping = false;
			chrome.webRequest.onBeforeRequest.removeListener(firstListener);
			chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
			chrome.webRequest.onBeforeRequest.addListener(
				firstListener,
				{
					urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'],
				},
				['blocking'],
			);
		} else if (request.message === 'scrape') {
			scraping = true;
			chrome.webRequest.onBeforeRequest.removeListener(firstListener);
			chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
			chrome.webRequest.onBeforeRequest.addListener(
				scrapeListener,
				{
					urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'],
				},
				['blocking'],
			);
			port.postMessage({
				message: 'scrape_started',
			});
		} else if (request.message === 'stop_scrape') {
			chrome.webRequest.onBeforeRequest.removeListener(firstListener);
			chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
			port.postMessage({ message: 'scrape_stopped' });
		} else if (request.message === 'abort') {
			scraping = false;
			chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
			chrome.webRequest.onBeforeRequest.removeListener(firstListener);
			port.postMessage({ message: 'scrape_aborted' });
		} else if (request.message === 'generateXlsx') {
			const posts = request.posts;
			const formatTable = request.formatTable || false;
			if (posts && posts.length) {
				generateXlsx(posts, formatTable, port);
			}
		}
	});
}

async function firstListener(details) {
	if (scraping) return;
	i++;
	scraping = false;
	let filter = chrome.webRequest.filterResponseData(details.requestId);
	let decoder = new TextDecoder('utf-8');
	let str = '';

	filter.ondata = (event) => {
		try {
			const chunk = decoder.decode(event.data, { stream: true });
			str += chunk;
			filter.write(event.data);
		} catch (e) {
			console.error('Error decoding chunk:', e);
			filter.disconnect();
		}
	};

	filter.onstop = async () => {
		try {
			let json = JSON.parse(str);
			if (!json) return;
			let entries =
				json.data?.search_by_raw_query?.search_timeline?.timeline?.instructions
					?.filter((instr) => instr.type === 'TimelineAddEntries')
					?.flatMap((instr) => instr.entries)
					.filter((entry) => entry.entryId.startsWith('tweet')) || [];
			if (!entries || !entries.length) return;
			let processedEntries = await processTweets(entries);
			port.postMessage({ message: 'first_data', data: processedEntries });
			filter.disconnect();
		} catch (e) {
			console.error('Error: ', e);
		} finally {
			filter.disconnect();
		}
	};

	return {};
}

async function scrapeListener(details) {
	i++;
	scraping = true;
	let filter = chrome.webRequest.filterResponseData(details.requestId);
	let decoder = new TextDecoder('utf-8');
	let str = '';
	if (tweets.length >= demand.limit) {
		chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
		port.postMessage({
			message: 'limit_reached',
		});
		return;
	}

	filter.ondata = (event) => {
		try {
			const chunk = decoder.decode(event.data, { stream: true });
			str += chunk;
			filter.write(event.data);
		} catch (e) {
			console.error('Error decoding chunk:', e);
			filter.disconnect();
		}
	};

	filter.onstop = async () => {
		try {
			let json = JSON.parse(str);
			let entries =
				json.data?.search_by_raw_query?.search_timeline?.timeline?.instructions
					?.filter((instr) => instr.type === 'TimelineAddEntries')
					?.flatMap((instr) => instr.entries)
					.filter((entry) => entry.entryId.startsWith('tweet')) || [];
			if (entries && entries.length) {
				let processedEntries = await processTweets(entries);
				tweets.push(...processedEntries);
				port.postMessage({
					message: 'progress',
					progress: processedEntries,
				});
				if (tweets.length >= demand.limit) {
					chrome.webRequest.onBeforeRequest.removeListener(
						scrapeListener,
					);
					filter.disconnect();
					port.postMessage({
						message: 'limit_reached',
					});
				}
			} else {
				chrome.webRequest.onBeforeRequest.removeListener(
					scrapeListener,
				);
				filter.disconnect();
				port.postMessage({
					message: 'no_more_data',
				});
			}
		} catch (e) {
			console.error('Error:', e);
		} finally {
			filter.disconnect();
		}
	};

	return {};
}

async function processTweets(entries) {
	let processedTweets = [];
	for (let entry of entries) {
		let tweetResult =
			entry.content?.itemContent?.tweet_results?.result?.tweet ||
			entry.content?.itemContent?.tweet_results?.result;
		if (tweetResult) {
			let tweet = {};
			let userResult = tweetResult.core?.user_results?.result;
			if (userResult) {
				tweet.user = userResult;
			}
			tweet.id = tweetResult.rest_id;
			for (let [key, value] of Object.entries(tweetResult.legacy || {})) {
				tweet[key] = value;
			}
			tweet.created_at = new Date(tweet.created_at).toISOString();
			if (tweetResult.note_tweet) {
				if (
					tweetResult.note_tweet.is_expandable &&
					tweetResult.note_tweet.note_tweet_results
				) {
					let noteResult =
						tweetResult.note_tweet.note_tweet_results.result;
					if (noteResult) {
						tweet.full_text = noteResult.text;
					}
				}
			}
			if (tweet.user && tweet.id) {
				tweet.url = `https://x.com/${tweet.user.core.screen_name}/status/${tweet.id}`;
			}
			processedTweets.push(tweet);
		}
	}
	return processedTweets;
}
async function generateXlsx(posts, formatTable, port) {
	let widths = [];
	Object.keys(posts[0]).forEach((key) => {
		widths.push({ key: key, widths: [] });
	});
	for (let p of posts) {
		for (let [key, value] of Object.entries(p)) {
			if (value) {
				let vString = value.toString();
				widths
					.find((w) => w.key === key)
					.widths.push(key.length, vString.length);
			}
		}
	}
	widths = widths.map((w) => {
		w.widths.sort((a, b) => b - a);
		return w.widths[0];
	});

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('X_scrape');
	worksheet.columns = Object.keys(posts[0]).map((key) => {
		return { header: key, key: key, width: widths.shift() };
	});

	const rows = [];
	function isDate(value) {
		const regexp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3}Z)?/;
		return regexp.test(value);
	}
	for (let p of posts) {
		let row = [];
		for (let [key, value] of Object.entries(p)) {
			if (isDate(value)) {
				value = new Date(value);
			} else if (key === 'url') {
				value = {
					text: value,
					hyperlink: value,
					tooltip: 'Link to tweet',
				};
			}
			row.push(value);
		}
		rows.push(row);
	}

	if (formatTable) {
		worksheet.addTable({
			name: 'X_scrape',
			ref: 'A1',
			headerRow: true,
			totalsRow: false,
			style: {
				theme: 'TableStyleMedium9',
				showRowStripes: true,
			},
			columns: worksheet.columns.map((col) => ({
				name: col.header,
				filterButton: true,
			})),
			rows: rows,
		});
	} else {
		worksheet.addRows(rows);
	}
	worksheet.columns.forEach((column) => {
		let maxLength = 10;
		column.eachCell({ includeEmpty: true }, (cell) => {
			cell.alignment = {
				wrapText: true,
				vertical: 'top',
				shrinkToFit: true,
			};
			if (cell.value && cell.value.hyperlink) {
				cell.style = {
					font: {
						size: 12,
						color: { argb: 'ff0000ff' },
						underline: true,
					},
				};
			} else {
				cell.font = { size: 12 };
			}
			let cellValue = cell.value.text || cell.value;
			if (cellValue instanceof Date) {
				cellValue = cellValue.toISOString();
			}
			let cellLength = cellValue ? cellValue.toString().length : 10;
			if (cellLength > maxLength) {
				maxLength = cellLength;
			}
		});
		if (maxLength >= 150) {
			maxLength = maxLength / 2;
		}
		column.width = maxLength;
	});
	worksheet.getRow(1).font = {
		bold: true,
		size: 12,
		color: { argb: 'FFFFFFFF' },
	};
	const buffer = await workbook.xlsx.writeBuffer();
	const binaryBlob = btoa(String.fromCharCode(...new Uint8Array(buffer)));
	const url = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${binaryBlob}`;
	port.postMessage({ success: true, url: url });
}
