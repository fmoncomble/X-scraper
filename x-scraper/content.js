console.log('X-Scraper content script injected');

let i = 1;
let tweetCount = 0;
let file;
let abort = false;
let cursor;
let firstData;
let scrapeData = [];
let newData = false;
let results = [];
let csvData;
let rateLimitRemaining;
let rateReset;
let scrapeStarted = false;

chrome.storage.local.set({ scrapeData: scrapeData });

chrome.runtime.onMessage.addListener(async function getResponseHeaders(
	message,
	sender,
	sendResponse
) {
	if (message.message === 'response_headers') {
		let rateLimitRemainingObj = message.headers.find((h) => {
			return h.name === 'x-rate-limit-remaining';
		});
		rateLimitRemaining = rateLimitRemainingObj.value;
		let rateResetObj = message.headers.find((h) => {
			return h.name === 'x-rate-limit-reset';
		});
		rateReset = rateResetObj.value;
	}
});

let port = chrome.runtime.connect({ name: 'x-scraper-port' });
port.onMessage.addListener((message) => {
	if (message.message === 'first_data') {
		firstData = message.data;
	}
});
port.onDisconnect.addListener((p) => {
	console.error('Port disconnected', p);
});
port.postMessage({ message: 'get_first_results' });

async function launchUI() {
	const dialog = document.createElement('dialog');
	dialog.classList.add('x-scraper');
	const dialogHtmlUrl = chrome.runtime.getURL('scrape_dialog.html');
	const dialogRes = await fetch(dialogHtmlUrl);
	if (!dialogRes.ok) {
		console.error('Failed to load dialog HTML:');
		return;
	}
	const dialogHtml = await dialogRes.text();
	dialog.innerHTML = dialogHtml;
	document.body.appendChild(dialog);
	dialog.showModal();

	const modal = dialog.querySelector('div#modal');
	const closeButton = dialog.querySelector('span#close-button');
	const scrapeUIContainer = dialog.querySelector('div#scrape-ui-container');
	const rateLimitNotice = dialog.querySelector('div#rate-limit-notice');
	const maxTweetsInput = dialog.querySelector('input#max-tweets-input');
	const maxTweetsInputLabel = dialog.querySelector('label');
	const scrapeButton = dialog.querySelector('button#scrape-button');
	const stopButton = dialog.querySelector('button#stop-button');
	const processContainer = dialog.querySelector('div#process-container');
	const resetDiv = dialog.querySelector('div#reset-div');
	const resetMsg = dialog.querySelector('div#reset-msg');
	const extractButton = dialog.querySelector('button#extract-button');
	const resetButton = dialog.querySelector('button#reset-button');
	const dlDialog = dialog.querySelector('#dl-dialog');
	const anonymizeCheckbox = dialog.querySelector('input#anonymize');
	const formatSelect = dialog.querySelector('#format-select');
	const dlConfirmBtn = dialog.querySelector('#dl-confirm-btn');

	if (rateLimitNotice.textContent === '') {
		let resetTime = new Date(rateReset * 1000);
		let now = new Date();
		let timeToReset = resetTime - now;
		let minutes = Math.floor((timeToReset % 3600000) / 60000);
		let seconds = Math.floor((timeToReset % 60000) / 1000);
		if (rateLimitRemaining > 0) {
			rateLimitNotice.innerHTML = `You have ${rateLimitRemaining} requests left:<br/>to avoid exceeding your rate limit, scraping more than ${
				rateLimitRemaining * 20
			} tweets will proceed at a rate of 20 tweets every 18 seconds.<br/>Rate limit resets at ${resetTime.toLocaleTimeString()}.`;
		} else {
			rateLimitNotice.innerHTML = `You have exhausted your rate limit:\ntry again in ${minutes} minutes and ${seconds} seconds`;
			for (
				let seconds = Math.floor(timeToReset / 1000);
				seconds >= 0;
				seconds--
			) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				if (seconds === 0) {
					window.location.reload();
				} else {
					let minutes = Math.floor((seconds % 3600) / 60);
					let secs = Math.floor(seconds % 60);
					rateLimitNotice.innerHTML = `You have exhausted your rate limit:\ntry again in ${minutes} minutes and ${secs} seconds`;
				}
			}
		}
	}

	let maxTweets;
	maxTweetsInput.addEventListener('change', () => {
		maxTweets = maxTweetsInput.value;
	});

	async function resetInterface() {
		abort = false;
		results = [];
		cursor = null;
		i = 1;
		tweetCount = 0;
		scrapeButton.removeAttribute('style');
		stopButton.removeAttribute('style');
		downloadButton.removeAttribute('style');
		maxTweetsInput.value = '';
		maxTweets = null;
		maxTweetsInput.removeAttribute('style');
		maxTweetsInputLabel.removeAttribute('style');
		fileFormat = 'xml';
		downloadButton.textContent = 'Download ' + fileFormat.toUpperCase();
		processContainer.textContent = '';
		downloadResult.textContent = '';
		resetDiv.removeAttribute('style');
		resetMsg.textContent =
			'You can also resume or click "Reset" to start afresh';
		extractButton.style.display = 'flex';
		rateLimitNotice.style.display = 'flex';
		if (rateLimitRemaining > 0) {
			rateLimitNotice.innerHTML = `You have ${rateLimitRemaining} requests left:\nto avoid exceeding your rate limit, scraping more than ${
				rateLimitRemaining * 20
			} tweets will proceed at a rate of 20 tweets every 18 seconds`;
		} else {
			let resetTime = new Date(rateReset * 1000);
			let now = new Date();
			let timeToReset = resetTime - now;
			let minutes = Math.floor((timeToReset % 3600000) / 60000);
			let seconds = Math.floor((timeToReset % 60000) / 1000);
			rateLimitNotice.innerHTML = `You have exhausted your rate limit:\ntry again in ${minutes} minutes and ${seconds} seconds`;
			for (
				let seconds = Math.floor(timeToReset / 1000);
				seconds >= 0;
				seconds--
			) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				if (seconds === 0) {
					window.location.reload();
				} else {
					let minutes = Math.floor((seconds % 3600) / 60);
					let secs = Math.floor(seconds % 60);
					rateLimitNotice.innerHTML = `You have exhausted your rate limit:\ntry again in ${minutes} minutes and ${secs} seconds`;
				}
			}
		}
	}

	window.onclick = function (event) {
		if (event.target == modal) {
			closeButton.click();
		}
	};
	closeButton.addEventListener('click', () => {
		abort = true;
		chrome.storage.local.set({ scrapeData: [] });
		dialog.close();
		dialog.remove();
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			closeButton.click();
		}
	});

	stopButton.addEventListener('click', () => {
		stopButton.style.display = 'none';
		abort = true;
	});

	resetButton.addEventListener('click', () => {
		chrome.storage.local.set({ scrapeData: [] });
		window.location.href = 'https://x.com/search-advanced';
	});

	scrapeButton.addEventListener('click', async () => {
		mode = 'default';
		let message = '';
		maxTweets = parseInt(maxTweetsInput.value);
		if (!maxTweets) {
			maxTweets = Infinity;
		}
		if (maxTweets === Infinity || maxTweets > rateLimitRemaining * 20) {
			mode = 'rateLimit';
			if (maxTweets === Infinity) {
				message = `Given X's rate limit, scrolling will proceed at a rate of 20 tweets every 18 seconds. Do you want to proceed?`;
			} else if (maxTweets > rateLimitRemaining * 20) {
				let timeInSeconds = (maxTweets / 20) * 18;
				if (timeInSeconds > 60) {
					let minutes = Math.floor(timeInSeconds / 60);
					let seconds = timeInSeconds % 60;
					if (minutes > 60) {
						let hours = Math.floor(minutes / 60);
						minutes = minutes % 60;
						message = `Given X's rate limit, scraping ${maxTweets} tweets will take a minimum of ${hours} hour(s), ${minutes} minute(s) and ${seconds} second(s). Do you want to proceed?`;
					} else {
						message = `Given X's rate limit, scraping ${maxTweets} tweets will take a minimum of ${minutes} minute(s) and ${seconds} second(s). Do you want to proceed?`;
					}
				} else {
					message = `Given X's rate limit, scraping ${maxTweets} tweets will take a minimum of ${
						(maxTweets / 20) * 18
					} seconds. Do you want to proceed?`;
				}
			}
			let proceed = window.confirm(message);
			if (!proceed) {
				resetInterface();
				return;
			}
		}

		stopButton.style.display = 'block';
		scrapeButton.style.display = 'none';
		await scrape();
	});

	extractButton.addEventListener('click', () => {
		if (results && results.length) {
			showOptions(results);
		}
	});

	let element = [];

	let iteration = 1;
	function observeMutations(iteration) {
		element = [];
		return new Promise((resolve) => {
			const observer = new MutationObserver((mutations) => {
				let mutationDetected = false;

				for (const mutation of mutations) {
					if (mutation.type === 'childList') {
						const addedNodes = mutation.addedNodes;
						if (addedNodes.length) {
							mutationDetected = true;
						}
					}
				}

				if (mutationDetected) {
					clearTimeout(inactivityTimeout);
					inactivityTimeout = setTimeout(() => {
						observer.disconnect();
						resolve(element);
					}, 1000);
				}
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});

			let inactivityTimeout = setTimeout(() => {
				observer.disconnect();
				resolve(element);
			}, 1000);
		});
	}
	observeMutations(iteration);

	async function scrape() {
		rateLimitNotice.style.display = 'none';
		abort = false;
		let scrollDelay = 1000;
		scrapeData = await chrome.storage.local
			.get('scrapeData')
			.then((result) => {
				return result.scrapeData || [];
			});
		results = scrapeData;
		if (scrapeData.length >= maxTweets) {
			results = scrapeData;
			endScrape();
			return;
		}
		processContainer.textContent = `Scraped ${scrapeData.length} tweet(s), scrolling...`;
		port.postMessage({
			message: 'scrape',
			limit: maxTweets,
		});
		port.onMessage.addListener(async (message) => {
			if (message.message === 'progress') {
				if (message.progress >= maxTweets) {
					endScrape();
					return;
				}
				if (abort) {
					port.postMessage({ message: 'abort' });
					endScrape();
					return;
				}
				if (mode === 'rateLimit') {
					for (let i = 18; i > 0; i--) {
						if (!abort) {
							await new Promise((resolve) =>
								setTimeout(resolve, 1000)
							);
							processContainer.textContent = `Scraped ${message.progress} tweet(s), now waiting ${i}...`;
						} else {
							port.postMessage({ message: 'abort' });
							endScrape();
							return;
						}
					}
				}
				processContainer.textContent = `Scraped ${message.progress} tweet(s), scrolling...`;
				await new Promise((resolve) =>
					setTimeout(resolve, scrollDelay)
				);
				await scrollToNext();
			} else if (message.message === 'scraped_data') {
				const scrapeData = message.data;
				if (scrapeData && scrapeData.length) {
					results.push(...scrapeData);
					endScrape();
					return;
				}
			} else if (message.message === 'scrape_stopped') {
				const scrapeData = message.data;
				if (scrapeData && scrapeData.length) {
					results.push(...scrapeData);
				}
				endScrape();
				return;
			}
		});
		async function scrollToNext() {
			try {
				iteration++;
				window.scrollTo(0, document.body.scrollHeight);
				await observeMutations(iteration);
				i++;
			} catch (error) {
				console.error(error);
			}
		}
	}

	function endScrape() {
		results.splice(maxTweets);
		rateLimitNotice.innerHTML = null;
		processContainer.textContent = `Scraped ${results.length} tweet(s)`;
		stopButton.style.display = 'none';
		maxTweetsInputLabel.style.display = 'none';
		maxTweetsInput.style.display = 'none';
		resetDiv.style.display = 'flex';
		showOptions(results);
		chrome.storage.local.set({ scrapeData: [] });
	}
	// Show data options dialog
	function getCheckedMetadata() {
		return new Promise((resolve) => {
			chrome.storage.local.get('XCheckedMetadata', (results) => {
				resolve(results.XCheckedMetadata || []);
			});
		});
	}

	let checkedMetadata = await getCheckedMetadata();

	async function showOptions(statuses) {
		const keyTree = await buildKeyTree(statuses);
		const container = dlDialog.querySelector('#keys-container');
		container.textContent = '';
		generateListTree(keyTree, container);
		const checkboxes = dlDialog.querySelectorAll(
			'input[type="checkbox"].data-item'
		);
		checkboxes.forEach((checkbox) => {
			updateParentCheckboxes(checkbox);
			if (checkbox.checked || checkbox.indeterminate) {
				const div = checkbox.closest('div.nested-container');
				if (div) {
					div.style.height = 'auto';
					const arrow = div.closest('li').querySelector('span.arrow');
					if (arrow) {
						arrow.textContent = '[less]';
					}
				}
			}
		});
		const postCountSpan = dlDialog.querySelector('#post-count');
		postCountSpan.textContent = `${statuses.length} post(s) extracted`;
		const closeBtn = dlDialog.querySelector('.close-btn');
		closeBtn.addEventListener('click', () => {
			dlDialog.close();
		});
		dlDialog.showModal();

		async function buildKeyTree(records) {
			let tree = {};
			for (let record of records) {
				async function addToTree(obj, record, prefix = '') {
					for (let key of Object.keys(record)) {
						if (record.hasOwnProperty(key)) {
							const value = record[key];
							const fullKey = prefix ? `${prefix}.${key}` : key;
							if (typeof value === 'object' && value !== null) {
								if (!obj[fullKey]) {
									obj[fullKey] = {};
								}
								await addToTree(obj[fullKey], value, fullKey);
							} else {
								obj[fullKey] = null;
							}
						}
					}
				}
				await addToTree(tree, record);
			}
			return tree;
		}

		async function generateListTree(tree, container) {
			const ul = document.createElement('ul');
			ul.style.listStyleType = 'none';
			ul.classList.add('dl-ui');

			for (let key in tree) {
				if (tree.hasOwnProperty(key)) {
					const li = document.createElement('li');
					li.classList.add('dl-ui');
					const checkbox = document.createElement('input');
					checkbox.type = 'checkbox';
					checkbox.classList.add('data-item');
					checkbox.id = key;
					checkbox.name = key;

					const label = document.createElement('label');
					label.htmlFor = key;
					label.appendChild(
						document.createTextNode(key.split('.').pop())
					);

					li.appendChild(checkbox);
					li.appendChild(label);
					ul.appendChild(li);

					if (
						key === 'full_text' ||
						key === 'user.core.screen_name' ||
						key === 'created_at' ||
						key === 'url' ||
						(checkedMetadata &&
							checkedMetadata.length &&
							checkedMetadata.includes(key))
					) {
						checkbox.checked = true;
					}

					if (tree[key] !== null) {
						let arrow = document.createElement('span');
						arrow.classList.add('arrow');
						arrow.textContent = '[more]';
						label.after(arrow);
						const nestedContainer = document.createElement('div');
						nestedContainer.classList.add('nested-container');
						nestedContainer.style.marginLeft = '20px';
						nestedContainer.style.height = '0px';
						arrow.addEventListener('click', (e) => {
							e.stopPropagation();
							if (nestedContainer.style.height === '0px') {
								nestedContainer.style.height = 'auto';
								arrow.textContent = '[less]';
							} else {
								const nestedContainers = Array.from(
									li.querySelectorAll('div.nested-container')
								);
								nestedContainers.forEach((container) => {
									container.style.height = '0px';
								});
								const arrows = Array.from(
									li.querySelectorAll('span.arrow')
								);
								arrows.forEach((a) => {
									a.textContent = '[more]';
								});
							}
						});
						generateListTree(tree[key], nestedContainer);
						li.appendChild(nestedContainer);

						checkbox.addEventListener('change', function () {
							const childCheckboxes =
								nestedContainer.querySelectorAll(
									'input[type="checkbox"]'
								);
							childCheckboxes.forEach((childCheckbox) => {
								childCheckbox.checked = checkbox.checked;
								childCheckbox.indeterminate = false;
							});
							if (checkbox.checked || checkbox.indeterminate) {
								nestedContainer.style.height = 'auto';
								arrow.textContent = '[less]';
							} else {
								nestedContainer.style.height = '0px';
								arrow.textContent = '[more]';
							}
						});
					}

					checkbox.addEventListener('change', function () {
						updateParentCheckboxes(checkbox);
					});
				}
			}
			Array.from(
				container.querySelectorAll("input[type='checkbox']")
			).forEach((checkbox) => {
				if (checkbox.checked) {
					updateParentCheckboxes(checkbox);
				}
			});
			container.appendChild(ul);
		}
	}

	function updateParentCheckboxes(checkbox) {
		const parentLi = checkbox.closest('li').parentElement.closest('li');
		if (parentLi) {
			const parentCheckbox = parentLi.querySelector(
				'input[type="checkbox"]'
			);
			const parentContainer = parentLi.querySelector(
				'div.nested-container'
			);
			const arrow = parentLi.querySelector('span.arrow');
			const childCheckboxes = parentContainer.querySelectorAll(
				'ul >li > input[type="checkbox"]'
			);
			const allChecked = Array.from(childCheckboxes).every(
				(child) => child.checked
			);
			const someChecked = Array.from(childCheckboxes).some(
				(child) => child.checked
			);

			if (someChecked || allChecked) {
				parentContainer.style.height = 'auto';
				arrow.textContent = '[less]';
			}

			parentCheckbox.checked = allChecked;
			parentCheckbox.indeterminate = !allChecked && someChecked;

			updateParentCheckboxes(parentCheckbox);
		}
	}

	let fileFormat = 'xml';
	formatSelect.addEventListener('change', () => {
		fileFormat = formatSelect.value;
		if (fileFormat === 'xlsx') {
			const tableFormat = dlDialog.querySelector(
				'label[for="table-checkbox"]'
			);
			const tableCheckbox = tableFormat.querySelector('input');
			tableCheckbox.checked = true;
			tableFormat.style.display = 'block';
		} else {
			const tableFormat = document.querySelector(
				'label[for="table-checkbox"]'
			);
			if (tableFormat) {
				tableFormat.remove();
			}
		}
	});

	// Listen to anonymize checkbox
	anonymizeCheckbox.addEventListener('change', () => {
		const authorHandleCheckbox = document.getElementById(
			'user.core.screen_name'
		);
		if (anonymizeCheckbox.checked) {
			authorHandleCheckbox.checked = true;
			authorHandleCheckbox.disabled = true;
			authorHandleCheckbox.nextElementSibling.textContent +=
				' (required for anonymization)';
			updateParentCheckboxes(authorHandleCheckbox);
		} else {
			authorHandleCheckbox.disabled = false;
			authorHandleCheckbox.nextElementSibling.textContent = 'screen_name';
		}
	});

	// Listen to download button
	dlConfirmBtn.addEventListener('click', async () => {
		let posts = await buildData(results);
		if (fileFormat === 'json') {
			downloadJson(posts);
		} else if (fileFormat === 'csv') {
			downloadCsv(posts);
		} else if (fileFormat === 'xml') {
			downloadXml(posts);
		} else if (fileFormat === 'txt') {
			downloadTxt(posts);
		} else if (fileFormat === 'xlsx') {
			downloadXlsx(posts);
		}
	});

	function getNestedValue(obj, keyPath) {
		return keyPath.split('.').reduce((acc, key) => acc && acc[key], obj);
	}

	async function buildData(statuses) {
		let posts = [];
		return new Promise((resolve) => {
			const anonymize = anonymizeCheckbox.checked;
			const accts = new Set();
			const pseudos = {};
			if (anonymize) {
				for (let s of statuses) {
					accts.add(s.user.core.screen_name);
				}
				for (let acct of accts) {
					pseudos[acct] = `user_${Object.keys(pseudos).length + 1}`;
				}
			}
			posts = [];
			const checkboxes = dlDialog.querySelectorAll(
				'input[type="checkbox"].data-item'
			);
			let checkedCheckboxes = Array.from(checkboxes)
				.filter((checkbox) => checkbox.checked)
				.map((checkbox) => checkbox.id);
			chrome.storage.local.set({
				XCheckedMetadata: checkedCheckboxes,
			});
			for (let s of statuses) {
				if (anonymize) {
					s.user.core.screen_name = pseudos[s.user.core.screen_name];
					s.user.core.name = pseudos[s.user.core.screen_name];
				}
				let post = {};
				for (let checkbox of checkboxes) {
					if (checkbox.checked) {
						const key = checkbox.id;
						const value = getNestedValue(s, key);
						post[key.replaceAll('.', '-')] = value;
					}
				}
				posts.push(post);
			}
			resolve(posts);
		});
	}

	// Download functions
	function downloadCsv(posts) {
		const spinner = document.createElement('span');
		spinner.classList.add('spinner');
		dlConfirmBtn.textContent = '';
		dlConfirmBtn.appendChild(spinner);
		spinner.style.display = 'inline-block';
		const header = Object.keys(posts[0]).join('\t');
		const rows = posts.map((post) => Object.values(post).join('\t'));
		const csv = [header, ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'X_scrape.csv';
		spinner.remove();
		dlConfirmBtn.textContent = 'Download';
		anchor.click();
	}

	function downloadJson(posts) {
		const spinner = document.createElement('span');
		spinner.classList.add('spinner');
		dlConfirmBtn.textContent = '';
		dlConfirmBtn.appendChild(spinner);
		spinner.style.display = 'inline-block';
		const json = JSON.stringify(posts, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'X_scrape.json';
		spinner.remove();
		dlConfirmBtn.textContent = 'Download';
		anchor.click();
	}

	function downloadXml(posts) {
		const spinner = document.createElement('span');
		spinner.classList.add('spinner');
		dlConfirmBtn.textContent = '';
		dlConfirmBtn.appendChild(spinner);
		spinner.style.display = 'inline-block';
		let xml = '<Text>';
		for (let p of posts) {
			console.log('Generating XML for post:', p);
			let postData = '<lb/>\n<post';
			for (let [key, value] of Object.entries(p)) {
				if (typeof value === 'string') {
					p[key] = value
						.replaceAll(/&/g, '&amp;')
						.replaceAll(/</g, '&lt;')
						.replaceAll(/>/g, '&gt;')
						.replaceAll(/"/g, '&quot;')
						.replaceAll(/'/g, '&apos;')
						.replaceAll(/\u00A0/g, ' ');
				}
				if (key.includes('_')) {
					delete p[key];
					let keyParts = key.split('_');
					keyParts.forEach((part, index) => {
						if (index > 0) {
							keyParts[index] =
								part.charAt(0).toUpperCase() + part.slice(1);
						}
					});
					key = keyParts.join('');
					p[key] = value;
				}
				if (key !== 'fullText' && key !== 'url') {
					postData += ` ${key}="${p[key]}"`;
				}
			}
			postData += '>';
			postData += `<lb/><ref target="${p.url}">Link to post</ref><lb/>`;
			let text = p['fullText'];
			const urlRegex =
				/(?:https?|ftp):\/\/[-A-Za-z0-9+&@#\/%?=~_|!:,.;]*[-A-Za-z0-9+&@#\/%=~_|]/;
			const links = text.match(urlRegex);
			if (links) {
				for (l of links) {
					const newLink = l.replace(
						/(.+)/,
						`<ref target="$1">$1</ref>`
					);
					text = text.replace(l, newLink);
				}
			}
			postData += `<lb/>${text.replaceAll(/\n/g, '<lb/>')}`;
			postData += '</post><lb/><lb/>\n';
			xml += postData;
		}
		xml += `</Text>`;
		const blob = new Blob([xml], { type: 'application/xml' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'X_scrape.xml';
		spinner.remove();
		dlConfirmBtn.textContent = 'Download';
		anchor.click();
	}

	function downloadTxt(posts) {
		const spinner = document.createElement('span');
		spinner.classList.add('spinner');
		dlConfirmBtn.textContent = '';
		dlConfirmBtn.appendChild(spinner);
		spinner.style.display = 'inline-block';
		let txt = '';
		for (let p of posts) {
			let postData = p['full_text'];
			postData += '\n\n*******************************\n\n';
			txt += postData;
		}
		const blob = new Blob([txt], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'X_scrape.txt';
		spinner.remove();
		dlConfirmBtn.textContent = 'Download';
		anchor.click();
	}

	async function downloadXlsx(posts) {
		const manifestVersion = chrome.runtime.getManifest().manifest_version;
		if (manifestVersion === 3) {
			const tableCheckbox = dialog.querySelector('#table-checkbox');
			port.onMessage.addListener((message) => {
				if (message.success) {
					const binaryUrl = message.url;
					const binaryString = atob(binaryUrl.split(',')[1]);
					const len = binaryString.length;
					const bytes = new Uint8Array(len);
					for (let i = 0; i < len; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					const blob = new Blob([bytes], {
						type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					});
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement('a');
					anchor.href = url;
					anchor.download = 'X_scrape.xlsx';
					anchor.click();
				} else {
					console.error('Error generating XLSX:', message.error);
				}
			});
			port.postMessage({
				message: 'generateXlsx',
				posts: posts,
				formatTable: tableCheckbox.checked,
			});
			return;
		}
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
			if (p.content.length > 32767) {
				continue;
			}
			let row = [];
			for (let [key, value] of Object.entries(p)) {
				if (isDate(value)) {
					value = new Date(value);
				} else if (key === 'url') {
					value = {
						text: value,
						hyperlink: value,
						tooltip: 'Link to post',
					};
				}
				row.push(value);
			}
			rows.push(row);
		}

		const tableCheckbox = dialog.querySelector('#table-checkbox');
		if (tableCheckbox.checked) {
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
		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'X_scrape.xlsx';
		anchor.click();
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'scrape') {
		launchUI();
		sendResponse({ success: true });
	}
});
