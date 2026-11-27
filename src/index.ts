import * as cheerio from 'cheerio';
import {setTimeout} from 'node:timers/promises';
import {Client} from "pg";


type vacancy = { title: string, vacancy_id: string, link: string }

const baseUrl = 'https://www.rabota.md'

const client = new Client({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: 'localhost',
    port: 5432,
    database: process.env.POSTGRES_DB,
})

const getVacancyFetch = async (page: string | number) => {
    const response = await fetch(`https://www.rabota.md/ru/vacancies/category/it/${page}`, {
        method: "POST",
        signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
        throw new Error(`error on ${page} page with status ${response.status}`);
    }
    const data = await response.json();
    if (!data.success) {
        throw new Error(`error on ${page} page with status ${response.status} and success:false`);
    }
    return data.data;
}

async function getVacancy() {
    const data = await getVacancyFetch(1);
    let vacancyList = [];

    const getVacancies = (data): vacancy[] => {
        const $ = cheerio.load(data);
        let vacancyhtml: vacancy[] = [];
        $('.vacancyRow').map((index, el) => {
            const link = $(el).find('a[title]')
            vacancyhtml.push({
                title: link.attr('title').trim(),
                vacancy_id: $(el).attr('id').slice(6),
                link: new URL(link.attr('href'), baseUrl).href,
            })
        }).get();
        $('.vacancyCardItem').map((index, el) => {
            const link = $(el).find('.vacancyShowPopup')
            const url = new URL(link.attr('href'), baseUrl).href
            vacancyhtml.push({
                title: link.find('span').text().trim(),
                vacancy_id: url.match(/\/(\d+)$/)?.[1] ?? url,
                link: url,
            })
        }).get()
        return vacancyhtml;
    }
    vacancyList.push(...getVacancies(data.content))
    let countIterations = Math.ceil(data.vacanciesCount / 100)
    for (let i = 1; i < countIterations; i++) {
        const data = await setTimeout(1000, await getVacancyFetch(i + 1));

        vacancyList.push(...getVacancies(data.content))
    }

    if (vacancyList.length !== new Set(vacancyList.map((v) => v.link)).size) {
        console.warn('vacancy list has duplicates')
    }
    if (vacancyList.length < data.vacanciesCount * 0.7) {
        console.warn(`vacancy length less than 70%, was collect ${vacancyList.length} vacancies from ${data.vacanciesCount}`)
    }
    return vacancyList;

}

const main = async () => {
    await client.connect()
    const vacancies = await getVacancy()
    for (const vacancy of vacancies) {
        await client.query('INSERT INTO jobs (vacancy_id, url, title) VALUES ($1, $2, $3) ON CONFLICT (vacancy_id) DO UPDATE SET last_seen_at = NOW(), title = EXCLUDED.title, url = EXCLUDED.url',
            [vacancy.vacancy_id, vacancy.link, vacancy.title]);
    }
    // const rows = await client.query('SELECT url, title FROM jobs WHERE sent_at IS NULL')
    // console.log(rows.rowCount);
}

main().catch((err) => {
    console.error(err)
    process.exitCode = 1
}).finally(async () => {
        await client.end()
    }
)
