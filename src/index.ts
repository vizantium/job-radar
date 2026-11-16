import * as cheerio from 'cheerio';
import {setTimeout} from 'node:timers/promises';

type vacancy = { title: string, id: string, link: string }

const baseUrl = 'https://www.rabota.md'

const getVacancyFetch = async (page: string | number) => {
    const response = await fetch(`https://www.rabota.md/ru/vacancies/category/it/${page}`, {method: "POST", signal: AbortSignal.timeout(30000)})
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
                id: $(el).attr('id').slice(6),
                link: new URL(link.attr('href'), baseUrl).href,
            })
        }).get();
        $('.vacancyCardItem').map((index, el) => {
            const link = $(el).find('.vacancyShowPopup')
            vacancyhtml.push({
                title: link.find('span').text().trim(),
                id: $(el).attr('data-vacancyid'),
                link: new URL(link.attr('href'), baseUrl).href,
            })
        }).get()
        return vacancyhtml;
    }
    vacancyList.push(...getVacancies(data.content))
    let countIterations = Math.ceil(data.vacanciesCount / 100)
    for (let i = 1; i < countIterations; i++) {
        const data = await setTimeout(1000, await getVacancyFetch(i + 1));

        vacancyList.push(...getVacancies(data.content))
        // console.log('страница', i + 1, 'вакансий:', getVacancies(data.content).length);
    }

    if (vacancyList.length !== new Set(vacancyList.map((v) => v.link)).size) {
        console.warn('vacancy list has duplicates')
    }
    // console.log(vacancyList);

}

getVacancy().catch((err) => {
    console.error(err)
    process.exit(1);
})