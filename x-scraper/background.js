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

let scraping = false;
let scrapeData = [];
chrome.storage.local.get('scrapeData').then((data) => {
	if (data.scrapeData) {
		scrapeData = data.scrapeData;
	}
});
chrome.runtime.onConnect.addListener(handlePort);
async function handlePort(p) {
	await chrome.storage.local.get('scrapeData').then((data) => {
		if (data.scrapeData) {
			scrapeData = data.scrapeData;
		}
	});
	const port = p;
	port.onDisconnect.addListener((p) => {
		console.error('Port disconnected', p);
	});
	port.onMessage.addListener(async (request) => {
		if (request.message === 'get_first_results') {
			chrome.webRequest.onBeforeRequest.addListener(
				(details) => firstListener(details, port, scraping, scrapeData),
				{
					urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'],
				},
				['blocking']
			);
		} else if (request.message === 'scrape') {
			scraping = true;
			chrome.webRequest.onBeforeRequest.removeListener(firstListener);
			chrome.webRequest.onBeforeRequest.addListener(
				(details) =>
					scrapeListener(
						details,
						port,
						request,
						scraping,
						scrapeData
					),
				{
					urls: ['*://x.com/i/api/graphql/*/SearchTimeline?*'],
				},
				['blocking']
			);
			await chrome.storage.local.get('scrapeData').then((data) => {
				if (data.scrapeData) {
					scrapeData = data.scrapeData;
				}
			});
			port.postMessage({
				message: 'progress',
				progress: scrapeData.length,
			});
		} else if (
			request.message === 'stop_scrape' ||
			request.message === 'abort'
		) {
			chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
			await chrome.storage.local.get('scrapeData').then((data) => {
				if (data.scrapeData) {
					scrapeData = data.scrapeData;
				}
			});
			let tweets = await processTweets(scrapeData);
			port.postMessage({ message: 'scrape_stopped', data: tweets });
		} else if (request.message === 'generateXlsx') {
			const posts = request.posts;
			const formatTable = request.formatTable || false;
			if (posts && posts.length) {
				generateXlsx(posts, formatTable, port);
			}
		}
	});
}

async function firstListener(details, port, scraping, scrapeData) {
	if (scraping) return;
	scraping = false;
	scrapeData = [];
	chrome.storage.local.set({ scrapeData: scrapeData });
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
			let entries =
				json.data?.search_by_raw_query?.search_timeline?.timeline?.instructions
					?.filter((instr) => instr.type === 'TimelineAddEntries')
					?.flatMap((instr) => instr.entries)
					.filter((entry) => entry.entryId.startsWith('tweet')) || [];
			let tweets = await processTweets(entries);
			scrapeData = tweets;
			chrome.storage.local.set({ scrapeData: scrapeData });
			port.postMessage({ message: 'first_data', data: scrapeData });
			filter.disconnect();
		} catch (e) {
			console.error('Error: ', e);
		} finally {
			filter.disconnect();
		}
	};

	return {};
}

async function scrapeListener(details, port, request, scraping, scrapeData) {
	let filter = chrome.webRequest.filterResponseData(details.requestId);
	let decoder = new TextDecoder('utf-8');
	let str = '';
	await chrome.storage.local.get('scrapeData').then((data) => {
		if (data.scrapeData) {
			scrapeData = data.scrapeData;
		}
	});
	if (scrapeData.length >= request.limit) {
		chrome.webRequest.onBeforeRequest.removeListener(scrapeListener);
		let tweets = await processTweets(scrapeData.slice(0, request.limit));
		port.postMessage({
			message: 'scraped_data',
			data: tweets,
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
				let tweets = await processTweets(entries);
				scrapeData.push(...tweets);
				chrome.storage.local.set({ scrapeData: scrapeData });
				port.postMessage({
					message: 'progress',
					progress: scrapeData.length,
				});
				if (scrapeData.length >= request.limit) {
					chrome.webRequest.onBeforeRequest.removeListener(
						scrapeListener
					);
					filter.disconnect();
					port.postMessage({
						message: 'scraped_data',
						data: scrapeData,
					});
				}
			} else {
				chrome.webRequest.onBeforeRequest.removeListener(
					scrapeListener
				);
				filter.disconnect();
				let tweets = await processTweets(scrapeData);
				port.postMessage({
					message: 'scraped_data',
					data: tweets,
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

async function processTweets(scrapeData) {
	let tweets = [];
	for (let entry of scrapeData) {
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
			tweets.push(tweet);
		}
	}
	return tweets;
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
	if (posts[0].hasOwnProperty('url')) {
		const urlCol = worksheet.getColumn('url');
		if (urlCol) {
			urlCol.eachCell(function (cell) {
				if (cell.value && cell.value.hyperlink) {
					cell.style = {
						font: {
							color: { argb: 'ff0000ff' },
							underline: true,
						},
					};
				}
			});
		}
	}
	const buffer = await workbook.xlsx.writeBuffer();
	const binaryBlob = btoa(String.fromCharCode(...new Uint8Array(buffer)));
	const url = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${binaryBlob}`;
	port.postMessage({ success: true, url: url });
}
