const thaiTime = () => {
    const date = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });
    const [day, month, year, time] = date.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}:\d{2}:\d{2})/).slice(1);
    return `${year}-${month}-${day} ${time}`;
};
module.exports = { thaiTime }