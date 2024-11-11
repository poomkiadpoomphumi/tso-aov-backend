
module.exports = {
    getDPRCode: (sequenceNumber) => {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const formattedSequenceNumber = String(sequenceNumber).padStart(3, '0');
        return `DPR${year}${month}${day}${formattedSequenceNumber}`;
    },
    addDPR: (code) => {
        let numericPart = code.match(/\d+$/)[0];
        let incrementedNumber = (+numericPart + 1).toString().padStart(3, '0');
        return code.replace(/\d+$/, incrementedNumber);
    },
    getLastTicket: async (db, params) => {
        let code = new RegExp('^' + params);
        return ticketId = await db.collection("tickets").findOne(
            { ticketId: code }, {
                sort: { _id: -1 }
        });
    }
}