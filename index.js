"use strict";

const nodemailer = require("nodemailer");
const http = require("http");
const https = require("https");
const fs = require("fs");
const { parse } = require("node-html-parser");

const config = JSON.parse(fs.readFileSync("config.json", { encoding: "utf8" }));
let transporter;

config.searches.forEach(x => {
	if (!x.url)
		return;

	const url_price = x.url.replace(/&sort=[^&=#]|(#)|$/, "&sort=p$1");
	const url_unit = x.url.replace(/&sort=[^&=#]|(#)|$/, "&sort=r$1");

	if (x.url.startsWith('https')) {
		if (x.targetPrice)
			https.get(url_price, y => httpCallback(y, 'price', x.targetPrice))
				.on('error', err => console.error(err.message));
		if (x.targetUnitPrice)
			https.get(url_unit, y => httpCallback(y, 'unit', x.targetUnitPrice))
				.on('error', err => console.error(err.message));
	} else {
		if (x.targetPrice)
			http.get(url_price, y => httpCallback(y, 'price', x.targetPrice))
				.on('error', err => console.error(err.message));
		if (x.targetUnitPrice)
			http.get(url_unit, y => httpCallback(y, 'unit', x.targetUnitPrice))
				.on('error', err => console.error(err.message));
	}
});

function httpCallback(resp, mode = 'price', price = 0) {
	let data = '';

	resp.on('data', (chunk) => {
		data += chunk;
	});

	resp.on('end', async () => {
		const products = resolve(data);
		let promises = [];

		switch (mode) {
			case 'price':
				products.forEach(x => {
					if (x.price <= price)
						promises.push(sendMail(x));
				});
				break;
			case 'unit':
				products.forEach(x => {
					if (x.pricePerUnit <= price)
						promises.push(sendMail(x));
				});
				break;
		}

		await Promise.all(promises);
	});
}

function resolve(html) {
	let products = [];

	parse(html).querySelectorAll('.filtercategory__productlist .productlist__product').forEach(x => {
		const name = x.querySelector('.productlist__link span').innerHTML.trim();
		const link = 'https://geizhals.at/' + x.querySelector('.productlist__link').attributes.href.trim();
		const price = Number(x.querySelector('.productlist__price .gh_price .gh_price').innerHTML.replace(/[^0-9,.]/, '').replace(',', '.').trim());
		const pricePerUnit = Number(x.querySelector('.productlist__price .gh_pricePerUnit span').innerHTML.replace(/[^0-9,.]/, '').replace(',', '.').trim());

		products.push({name, link, price, pricePerUnit});
	});

	return products;
}

async function sendMail(product) {
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: config.mail.host || '',
			port: config.mail.port || 465,
			secure: config.mail.secure || false,
			auth: {
				user: config.mail.user || '',
				pass: config.mail.pass || ''
			}
		});
	}

	console.log(`Sending mail(s) about product: '${product.name}' to [${config.recipients.join(', ')}]`);
	await transporter.sendMail({
		from: '"Geizhals Crawler" <geizhals.crawler@gmail.com>',
		to: config.recipients.join(','),
		subject: 'New Deal found!',
		html: fs.readFileSync('mail.html', {encoding: 'utf8'})
			.replace('%%link%%', product.link)
			.replace('%%name%%', product.name)
			.replace('%%price%%', product.price)
			.replace('%%pricePerUnit%%', product.pricePerUnit)
	});
}
