console.log('X-Scraper content script injected');

let i = 1;
let abort = false;
let stopped = false;
let tweets = [];
let rateLimitRemaining;
let rateReset;
let timeToReset;
let statusCode;
let now;
let idleTime = 1000;
let scraped = false;
let query = window.location.search || '';

chrome.storage.local.set({ tweets: tweets });

let port = chrome.runtime.connect({ name: 'x-scraper-port' });
port.onMessage.addListener((message) => {
	if (message.message === 'response_headers') {
		let rateLimitRemainingObj = message.headers.find((h) => {
			return h.name === 'x-rate-limit-remaining';
		});
		rateLimitRemaining = rateLimitRemainingObj.value;
		let rateResetObj = message.headers.find((h) => {
			return h.name === 'x-rate-limit-reset';
		});
		rateReset = rateResetObj.value;
		timeToReset = rateReset * 1000 - Date.now();
		let responseTime = message.headers.find((h) => {
			return h.name === 'x-response-time';
		}).value;
		responseTime > 1000 ? (idleTime = responseTime) : (idleTime = 1000);
		statusCode = message.status;
	}
	if (message.message === 'first_data') {
		let newQuery = window.location.search || '';
		if (newQuery !== query) {
			tweets = message.data;
			query = newQuery;
			scraped = false;
		} else {
			tweets.push(...message.data);
		}
		chrome.storage.local.set({ tweets: tweets });
	}
	if (message.message === 'ping') {
		port.postMessage({ message: 'pong' });
	}
});
port.onDisconnect.addListener((p) => {
	console.error('Port disconnected', p);
	port = chrome.runtime.connect({ name: 'x-scraper-port' });
});
port.postMessage({ message: 'get_first_results' });

async function launchUI() {
	if (!tweets || !tweets.length) {
		tweets = await chrome.storage.local.get('tweets').then((result) => {
			return result.tweets || [];
		});
	}
	if (!tweets || !tweets.length) {
		window.alert(
			'Failed to scrape first tweets. Reload the page and try again.'
		);
		window.location.reload();
		return;
	}
	let dialog = document.querySelector('dialog.x-scraper');
	if (!dialog) {
		dialog = document.createElement('dialog');
		dialog.classList.add('x-scraper');
		const dialogHtmlUrl = chrome.runtime.getURL('scrape_dialog.html');
		const dialogRes = await fetch(dialogHtmlUrl);
		if (!dialogRes.ok) {
			console.error('Failed to load dialog HTML:');
			return;
		}
		const dialogHtml = await dialogRes.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(dialogHtml, 'text/html');
		const scrapeUI = doc.body.firstElementChild;
		const downloadUI = scrapeUI.nextElementSibling;
		const spinner = downloadUI.nextElementSibling;
		dialog.appendChild(scrapeUI);
		dialog.appendChild(downloadUI);
		dialog.appendChild(spinner);
		document.body.appendChild(dialog);
	}
	dialog.showModal();

	const modal = dialog.querySelector('div#modal');
	const closeButton = dialog.querySelector('span#close-button');
	const rateLimitNotice = dialog.querySelector('div#rate-limit-notice');
	const maxTweetsInput = dialog.querySelector('input#max-tweets-input');
	const maxTweetsInputLabel = dialog.querySelector('label');
	const scrapeButton = dialog.querySelector('button#scrape-button');
	const stopButton = dialog.querySelector('button#stop-button');
	const processContainer = dialog.querySelector('div#process-container');
	const resetDiv = dialog.querySelector('div#reset-div');
	const extractButton = dialog.querySelector('button#extract-button');
	const resetButton = dialog.querySelector('button#reset-button');
	const dlDialog = dialog.querySelector('#dl-dialog');
	const anonymizeCheckbox = dialog.querySelector('input#anonymize');
	const formatSelect = dialog.querySelector('#format-select');
	const dlConfirmBtn = dialog.querySelector('#dl-confirm-btn');
	const spinner = dialog.querySelector('.spinner.x-scraper');

	if (scraped && tweets && tweets.length) {
		processContainer.textContent = `Scraped ${tweets.length} tweet(s).`;
		scrapeButton.textContent = 'Resume';
	} else {
		processContainer.textContent = null;
		scrapeButton.textContent = 'Start Scraping';
	}

	rateLimitNotice.style.display = 'flex';

	let timeToReset = rateReset * 1000 - Date.now();
	let resetTime = new Date(rateReset * 1000);
	let minutes = Math.floor((timeToReset % 3600000) / 60000);
	let seconds = Math.floor((timeToReset % 60000) / 1000);
	if (rateLimitRemaining > 0) {
		rateLimitNotice.textContent = `Your are currently limited to ${rateLimitRemaining} request(s) by the 𝕏 API: to avoid blocking, scrolling will be staggered by several seconds if you scrape more than ${
			rateLimitRemaining * 20
		} tweets.\nYour rate limit will be restored to 50 requests at ${resetTime.toLocaleTimeString()}.`;
	} else {
		rateLimitNotice.textContent = `You have exhausted your rate limit:\ntry again in ${minutes} minutes and ${seconds} seconds`;
		scrapeButton.disabled = true;
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
				rateLimitNotice.textContent = `You have exhausted your rate limit:\ntry again in ${minutes} minutes and ${secs} seconds`;
			}
		}
	}

	let maxTweets;
	maxTweetsInput.onkeydown = function (e) {
		if (e.key === 'Enter') {
			scrapeButton.click();
		}
	};

	window.onclick = function (event) {
		if (event.target == modal) {
			closeButton.click();
		}
	};
	closeButton.onclick = () => {
		scrapeButton.style.display = 'flex';
		stopButton.style.display = 'none';
		resetDiv.style.display = 'flex';
		abort = true;
		scraped = true;
		dialog.close();
		dlDialog.close();
	};
	document.onkeydown = (event) => {
		if (event.key === 'Escape') {
			closeButton.click();
		}
	};

	resetButton.onclick = () => {
		chrome.storage.local.set({ tweets: [] });
		window.location.href = 'https://x.com/search-advanced';
	};

	scrapeButton.onclick = async () => {
		resetDiv.style.display = 'none';
		mode = 'default';
		let message = '';
		maxTweets = parseInt(maxTweetsInput.value);
		if (!maxTweets) {
			maxTweets = Infinity;
		}
		if (maxTweets === Infinity || maxTweets > rateLimitRemaining * 20) {
			mode = 'rateLimit';
			if (maxTweets === Infinity) {
				message = `Given X's rate limit, scrolling will start at a rate of 20 tweets every ${Math.ceil(
					timeToReset / rateLimitRemaining / 1000
				)} seconds. Do you want to proceed?`;
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
				return;
			}
		}

		stopButton.style.display = 'flex';
		scrapeButton.style.display = 'none';
		await scrape();
	};

	extractButton.onclick = () => {
		const newSpinner = spinner.cloneNode(true);
		newSpinner.style.display = 'flex';
		extractButton.textContent = null;
		extractButton.appendChild(newSpinner);
		if (tweets && tweets.length) {
			showOptions(tweets);
			extractButton.textContent = 'Extract';
		}
	};

	let element = [];
	let iteration = 0;
	function observeMutations(iteration) {
		element = [];
		return new Promise((resolve) => {
			const observer = new MutationObserver((mutations) => {
				let mutationDetected = false;

				for (const mutation of mutations) {
					if (mutation.type === 'childList') {
						const addedNodes = mutation.addedNodes;
						if (addedNodes.length) {
							addedNodes.forEach((node) => {
								mutationDetected = true;
								element.push(node);
							});
						}
					}
				}

				if (mutationDetected) {
					clearTimeout(inactivityTimeout);
					inactivityTimeout = setTimeout(() => {
						observer.disconnect();
						resolve(element);
					}, idleTime);
				}
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});

			let inactivityTimeout = setTimeout(() => {
				observer.disconnect();
				resolve(element);
			}, idleTime);
		});
	}
	observeMutations(iteration);

	async function scrape() {
		try {
			iteration = 0;
			if (!tweets || !tweets.length) {
				window.alert(
					'Failed to scrape first tweets. Reload the page and try again.'
				);
				window.location.reload();
				return;
			}
			stopButton.onclick = () => {
				const stopSpinner = spinner.cloneNode(true);
				stopSpinner.classList.add('stop');
				stopSpinner.style.display = 'flex';
				stopButton.textContent = null;
				stopButton.appendChild(stopSpinner);
				rateLimitNotice.style.display = 'flex';
				stopped = true;
			};
			rateLimitNotice.style.display = 'none';
			abort = false;
			stopped = false;
			let scrollDelay = 1000;
			let waitTime = 1000;
			if (mode === 'rateLimit') {
				scrollDelay = Math.ceil(timeToReset / rateLimitRemaining);
			}
			tweets = await chrome.storage.local.get('tweets').then((result) => {
				return result.tweets || [];
			});
			if (tweets.length >= maxTweets) {
				port.postMessage({ message: 'stop_scrape' });
				port.onMessage.removeListener(onMessage);
				endScrape('Max tweets reached before start.');
				return;
			}
			processContainer.textContent = `Scraped ${tweets.length} tweet(s), scrolling...`;
			port.postMessage({
				message: 'scrape',
				limit: maxTweets,
			});
			port.onMessage.addListener(onMessage);
			async function onMessage(message) {
				if (message.message === 'response_headers') {
					if (statusCode !== 200) {
						port.postMessage({ message: 'stop_scrape' });
						port.onMessage.removeListener(onMessage);
						endScrape(
							`Scrape stopped due to HTTP status ${statusCode}.`
						);
					}
				}
				if (tweets.length >= maxTweets) {
					port.onMessage.removeListener(onMessage);
					endScrape('Max tweets reached.');
				}
				if (message.message === 'scrape_started') {
					processContainer.textContent = `Scraped ${tweets.length} tweet(s), scrolling...`;
					await new Promise((resolve) =>
						setTimeout(resolve, waitTime)
					);
					let mut = await scrollToNext();
					if (!mut) {
						port.postMessage({ message: 'stop_scrape' });
						port.onMessage.removeListener(onMessage);
						endScrape('No mutation observed after start.');
					}
				} else if (message.message === 'progress') {
					if (message.progress.length >= maxTweets) {
						port.onMessage.removeListener(onMessage);
						endScrape('Progress exceeds max tweets.');
						return;
					}
					tweets.push(...message.progress);
					chrome.storage.local.set({ tweets: tweets });
					if (abort) {
						port.postMessage({ message: 'abort' });
						processContainer.textContent = `Scraped ${tweets.length} tweet(s).`;
						return;
					}
					if (stopped) {
						port.postMessage({ message: 'stop_scrape' });
						processContainer.textContent = `Scraped ${tweets.length} tweet(s).`;
						endScrape('Scrape stopped by user l.331.');
						return;
					}
					if (mode === 'rateLimit') {
						scrollDelay =
							Math.ceil(timeToReset / rateLimitRemaining / 1000) *
							1000;
						for (let i = scrollDelay / 1000; i > 0; i--) {
							if (!abort && !stopped) {
								await new Promise((resolve) =>
									setTimeout(resolve, 1000)
								);
								processContainer.textContent = `Scraped ${tweets.length} tweet(s), now waiting ${i}...`;
							} else {
								if (abort) {
									port.postMessage({ message: 'abort' });
								} else if (stopped) {
									port.postMessage({
										message: 'stop_scrape',
									});
									endScrape('Scrape stopped by user l.352.');
								}
								port.onMessage.removeListener(onMessage);
								return;
							}
						}
					}
					if (tweets.length >= maxTweets) {
						port.onMessage.removeListener(onMessage);
						endScrape('Max tweets reached after progress.');
						return;
					} else {
						processContainer.textContent = `Scraped ${tweets.length} tweet(s), scrolling...`;
						await new Promise((resolve) =>
							setTimeout(resolve, waitTime)
						);
						let mut = await scrollToNext();
						if (!mut) {
							port.postMessage({ message: 'stop_scrape' });
							port.onMessage.removeListener(onMessage);
							endScrape('No mutation observed after progress.');
							return;
						}
					}
				} else if (
					message.message === 'scraped_data' ||
					message.message === 'limit_reached'
				) {
					const scrapeData = message.data;
					if (scrapeData && scrapeData.length) {
						tweets.push(...scrapeData);
						chrome.storage.local.set({ tweets: tweets });
					}
					port.onMessage.removeListener(onMessage);
					endScrape(
						'Received limit_reached or scraped_data from background.'
					);
					return;
				} else if (message.message === 'scrape_stopped') {
					const scrapeData = message.data;
					if (scrapeData && scrapeData.length) {
						tweets.push(...scrapeData);
						chrome.storage.local.set({ tweets: tweets });
					}
					port.onMessage.removeListener(onMessage);
					endScrape('Received scrape_stopped from background.');
					return;
				} else if (message.message === 'scrape_aborted') {
					port.onMessage.removeListener(onMessage);
					port.postMessage({ message: 'get_first_results' });
					processContainer.textContent = `Scraped ${tweets.length} tweet(s).`;
					return;
				} else if (message.message === 'no_more_data') {
					port.onMessage.removeListener(onMessage);
					endScrape('Received no_more_data from background.');
					return;
				}
			}
		} catch (error) {
			console.error('Scrape error:', error);
			window.alert('An error occurred. Please try again.');
			return;
		}
		async function scrollToNext() {
			return new Promise(async (resolve) => {
				try {
					window.scrollTo(
						0,
						document.documentElement.scrollHeight * 2
					);
					let mut = await observeMutations(iteration);
					i++;
					if (iteration > 0 && (!mut || !mut.length)) {
						resolve(false);
					} else {
						iteration++;
						resolve(true);
					}
				} catch (error) {
					console.error(error);
					resolve(false);
				}
			});
		}

		function endScrape(reason) {
			tweets.splice(maxTweets);
			processContainer.textContent = `Scraped ${tweets.length} tweet(s)`;
			stopButton.style.display = 'none';
			scrapeButton.style.display = 'flex';
			scrapeButton.textContent = 'Resume';
			resetDiv.style.display = 'flex';
			showOptions(tweets);
			stopButton.style.display = 'none';
			stopButton.textContent = 'Stop';
			scrapeButton.style.display = 'flex';
			scrapeButton.textContent = 'Resume';
			scraped = true;
			port.postMessage({ message: 'get_first_results' });
		}
	}

	// Show data options dialog
	function getCheckedMetadata() {
		return new Promise((resolve) => {
			chrome.storage.local.get('XCheckedMetadata', (tweets) => {
				resolve(tweets.XCheckedMetadata || []);
			});
		});
	}

	let checkedMetadata = await getCheckedMetadata();

	async function showOptions(statuses) {
		try {
			Array.from(
				dlDialog.querySelectorAll('input[type="checkbox"]')
			).forEach((cb) => {
				cb.checked = false;
			});
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
						const arrow = div
							.closest('li')
							.querySelector('span.arrow');
						if (arrow) {
							arrow.textContent = '[less]';
						}
					}
				}
			});
			const postCountSpan = dlDialog.querySelector('#post-count');
			postCountSpan.textContent = `${statuses.length} tweet(s) scraped`;
			const closeBtn = dlDialog.querySelector('.close-btn');
			closeBtn.onclick = () => {
				dlDialog.close();
			};
			dlDialog.showModal();
		} catch (error) {
			console.error('Error showing options:', error);
		}

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
	formatSelect.onchange = () => {
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
		if (fileFormat === 'txt') {
			const checkboxes = dlDialog.querySelectorAll(
				'input[type="checkbox"].data-item'
			);
			checkboxes.forEach((checkbox) => {
				if (checkbox.id !== 'full_text') {
					checkbox.checked = false;
					updateParentCheckboxes(checkbox);
				}
			});
		}
	};

	// Listen to anonymize checkbox
	anonymizeCheckbox.onchange = () => {
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
	};

	// Listen to download button
	dlConfirmBtn.onclick = async () => {
		fileFormat = formatSelect.value;
		let posts = await buildData(tweets);
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
		} else if (fileFormat === 'ira') {
			downloadIra(posts);
		}
	};

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
			let postData = '';
			for (let [key, value] of Object.entries(p)) {
				if (key !== 'full_text') {
					postData += `${key}: ${value}\n`;
				}
			}
			postData += `\n\t${p['full_text']}\n`;
			postData += '\n--------------------\n\n';
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

	function downloadIra(posts) {
		const spinner = document.createElement('span');
		spinner.classList.add('spinner');
		dlConfirmBtn.textContent = '';
		dlConfirmBtn.appendChild(spinner);
		spinner.style.display = 'inline-block';
		let txt = '';
		for (let p of posts) {
			let postData = '**** ';
			for (let [key, value] of Object.entries(p)) {
				if (key !== 'full_text') {
					postData += `*${key}_${value} `;
				}
			}
			postData += `\n${p['full_text']}\n\n`;
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
			port.onMessage.addListener(receiveXlsx);
			function receiveXlsx(message) {
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
					port.onMessage.removeListener(receiveXlsx);
				} else {
					console.error('Error generating XLSX:', message.error);
				}
			}
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
