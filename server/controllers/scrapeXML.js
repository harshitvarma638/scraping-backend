const puppeteer = require('puppeteer');
const {XMLParser} = require('fast-xml-parser');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const parser = new XMLParser();

const getSitemapUrl = async (domain) => {
    try{
        const response = await fetch(`https://${domain}/robots.txt`);
        const text = await response.text();
        const sitemapUrl = text.match(/sitemap:\s*(.*)/i);

        if(!sitemapUrl){
            throw new Error('Sitemap not found');
        }
        return sitemapUrl[1].trim();
    }
    catch(error){
        console.error(error);
        throw new Error('Error in parsing robots.txt' + error.message);
    }
}

const getFirstProductSitemap = async (sitemapUrl) => {
    try{
        const response = await axios.get(sitemapUrl);
        const xmlContent = response.data;
        const jsonObj = parser.parse(xmlContent);
        
        if (!jsonObj.sitemapindex || !jsonObj.sitemapindex.sitemap || !jsonObj.sitemapindex.sitemap.length) {
            throw new Error('Invalid sitemap index format');
        }

        // Find the first product sitemap URL
        const productSitemap = jsonObj.sitemapindex.sitemap.find(sitemap => sitemap.loc.includes('sitemap_products'));
        if (!productSitemap) {
            throw new Error('Product sitemap URL not found in sitemap index');
        }

        return productSitemap.loc;
    }
    catch(error){
        console.error(error);
        throw new Error('Error in parsing sitemap' + error.message);
    }
}

const extractProductData = async (productUrl) => {
    try{
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(productUrl);

        const productData = await page.evaluate(() => {
            const titleElement = document.querySelector('title');
            const title = titleElement ? titleElement.innerText : null;

            const descriptionElement = document.querySelector('meta[name="description"]');
            const description = descriptionElement ? descriptionElement.getAttribute('content') : null;

            const priceElement = document.querySelector('.price');
            const price = priceElement ? priceElement.innerText : null;
            
            // const textContent = [];
            // document.querySelectorAll('h1, h2, h3, h4, p, li, span, div').forEach(element => {
            //     const text = element.innerText.trim();
            //     if (text) {
            //         textContent.push(text);
            //     }
            // });
            const allCombined = {
                title,
                price,
                description
                // textContent: textContent.join(' ')
            }
            return allCombined;
        });

        await browser.close();
        return productData;
    }
    catch(error){
        console.error(error);
        throw new Error('Error in extracting product data' + error.message);
    }
}

const getSummaryFromGroqCloud = async (productData) => {
    try{
        console.log(productData);
        const summary = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: `Give a summary of the product description in exactly 3 points. 
                    Each point should have exactly 4-5 words. 
                    Do not include any introductory text. 
                    Start each point on a new line without any additional text.
                    If no sufficient data just give the line 'No summary found'.
                    The format should be:
                    \n
                    1. <Point one>
                    2. <Point two>
                    3. <Point three>
                    \n
                    Product description: ${productData}`

                },
            ],
            model: "llama3-8b-8192",
        })
        const summaryText = summary.choices[0]?.message?.content || 'No summary found';
        return summaryText;
    }
    catch(error){
        console.error(error);
        throw new Error('Error in getting summary from Groq cloud' + error.message);
    }
};

const scrapeXML = async (req, res) => {
    
    try{
        const {url} = req.body;
        const sitemapUrl = await getSitemapUrl(url);
        const productSitemap = await getFirstProductSitemap(sitemapUrl);
        if(!productSitemap){
            return res.status(404).json({success: false, error: 'Product sitemap not found'});
        }
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(productSitemap);

        const xmlContent = await page.evaluate(() => document.querySelector('body').innerText);

        const jsonObj = parser.parse(xmlContent);
        const urls = jsonObj.urlset.url;
        const products = urls.filter(product=> product['image:image'] && product.lastmod).map(product => ({
            link: product.loc,
            image: product['image:image'] ? product['image:image']['image:loc'] : null,
            imageTitle: product['image:image'] ? product['image:image']['image:title'] : null,
        })).slice(0,5);

        for(let i=0;i<products.length;i++){
            const productData = await extractProductData(products[i].link);
            const summary = await getSummaryFromGroqCloud(productData.description);
            console.log(summary);
            products[i].summary = summary;
        }
        console.log('reached here');
        await browser.close();

        res.status(200).json({success:true, data: products});
    }
    catch(error) {
        console.error(error);
        res.status(500).json({success: false, error: error.message});
    }
}

module.exports = scrapeXML;