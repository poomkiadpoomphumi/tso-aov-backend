module.exports = {
    TicketMongoDB: (code) => {
        return [{
            $match: {
                $or: [
                    {
                        maxLevelApprover: 3,
                        $or: [
                            { sectionHeadCode: code, sectionHeadStatus: 'approved' },
                            { sectionHeadCode: code, sectionHeadStatus: 'reject' }
                        ]
                    }, {
                        maxLevelApprover: 4,
                        $or: [
                            { sectionHeadStatus: 'approved', departmentHeadStatus: 'approved', sectionHeadCode: code },
                            { sectionHeadStatus: 'approved', departmentHeadStatus: 'wait', sectionHeadCode: code },
                            { sectionHeadStatus: 'approved', departmentHeadStatus: 'reject', sectionHeadCode: code },
                            { sectionHeadStatus: 'reject', departmentHeadStatus: 'wait', sectionHeadCode: code },
                            { sectionHeadStatus: 'approved', departmentHeadStatus: 'approved', departmentHeadCode: code },
                            { sectionHeadStatus: 'approved', departmentHeadStatus: 'reject', departmentHeadCode: code }
                        ]
                    }
                ]
            }
        },
        {
            $group: {
                _id: "$_id",
                doc: { $first: "$$ROOT" }
            }
        },
        {
            $replaceRoot: { newRoot: "$doc" }
        }]
    },
    TicketGroup: (formIds) => {
        return [
            {
                $match: { formId: { $in: formIds } }
            },
            {
                $group: {
                    _id: "$formId",
                    doc: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$doc" }
            }
        ]
    },
    formatDateWithoutMilliseconds: (date) => {
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date value provided");
        }
        return date.toISOString().split('.')[0] + 'Z';
    },
    formatDate: (start, end) => {
        // Parse input dates
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Invalid start or end date");
        }

        // Set endDate to the end of the day
        endDate.setUTCHours(23, 59, 59, 999);

        return [module.exports.formatDateWithoutMilliseconds(startDate), module.exports.formatDateWithoutMilliseconds(endDate)];
    },

    GroupByUserCode: (s, e) => {
        const pipeline = [];
        if (s && e) {
            // Push stages to pipeline
            pipeline.push(
                {
                    $addFields: {
                        dateFromTimeStamp: {
                            $dateFromString: {
                                dateString: "$time_stamp",
                                format: "%Y-%d-%m %H:%M:%S",
                                onError: null,
                                onNull: null
                            }
                        }
                    }
                },
                {
                    $project: {
                        time_stamp: 1,
                        unitabbr: 1,
                        user_code: 1,
                        dateFromTimeStamp: 1
                    },
                },
                {
                    $match: {
                        dateFromTimeStamp: {
                            $gte: new Date(module.exports.formatDate(s, e)[0]), // Start date is inclusive
                            $lte: new Date(module.exports.formatDate(s, e)[1]) // End date is inclusive
                        }
                    }
                },
                {
                    $group: {
                        _id: "$user_code",
                        unitabbr: { $first: "$unitabbr" },
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            );
        } else {
            pipeline.push(
                {
                    $group: {
                        _id: "$user_code",
                        unitabbr: { $first: "$unitabbr" },
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            );
        }
        return pipeline;
    },
    GroupByMonth: (s, e) => {
        const pipeline = [];
        if (s, e) {
            pipeline.push(
                {
                    $addFields: {
                        // Attempt to parse date; if invalid, set to null
                        parsedDate: {
                            $dateFromString: {
                                dateString: "$time_stamp",
                                format: "%Y-%d-%m %H:%M:%S",
                                onError: null  // Set to null on parse error
                            }
                        }
                    }
                },
                {
                    $match: {
                        parsedDate: {
                            $gte: new Date(module.exports.formatDate(s, e)[0]), // Start date is inclusive
                            $lte: new Date(module.exports.formatDate(s, e)[1]) // End date is inclusive
                        }
                    }
                },
                {
                    $addFields: {
                        // Convert valid dates to YYYY-MM format
                        month: {
                            $dateToString: {
                                format: "%Y-%m",
                                date: "$parsedDate"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$month", // Group by month
                        count: { $sum: 1 } // Count the number of documents in each month
                    }
                },
                {
                    $sort: { _id: 1 } // Sort by month in ascending order
                }
            );
        } else {
            pipeline.push(
                {
                    $addFields: {
                        // Attempt to parse date; if invalid, set to null
                        parsedDate: {
                            $dateFromString: {
                                dateString: "$time_stamp",
                                format: "%Y-%d-%m %H:%M:%S",
                                onError: null  // Set to null on parse error
                            }
                        }
                    }
                },
                {
                    $match: {
                        parsedDate: { $ne: null } // Filter out documents with invalid dates
                    }
                },
                {
                    $addFields: {
                        // Convert valid dates to YYYY-MM format
                        month: {
                            $dateToString: {
                                format: "%Y-%m",
                                date: "$parsedDate"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$month", // Group by month
                        count: { $sum: 1 } // Count the number of documents in each month
                    }
                },
                {
                    $sort: { _id: 1 } // Sort by month in ascending order
                }
            );
        }
        return pipeline;
    },
    GroupBySystem: (s, e) => {
        const pipeline = [];
        if (s && e) {
            pipeline.push(
                {
                    $addFields: {
                        dateFromTimeStamp: {
                            $dateFromString: {
                                dateString: "$createAt",
                                format: "%Y-%d-%m %H:%M:%S",
                                onError: null,
                                onNull: null
                            }
                        },
                        isRecent: {
                            $cond: {
                                if: { $gt: ["$dateFromTimeStamp", new Date(module.exports.formatDate(s, e)[0])] },
                                then: true,
                                else: false
                            }
                        }
                    }
                },
                {
                    $match: {
                        dateFromTimeStamp: {
                            $gte: new Date(module.exports.formatDate(s, e)[0]), // Start date is inclusive
                            $lte: new Date(module.exports.formatDate(s, e)[1]) // End date is inclusive
                        },
                        sectionHeadStatus: { $ne: 'draft' }
                    }
                },
                {
                    $lookup: {
                        from: 'formDetails',          // The collection to join with
                        localField: 'formId',         // Field from the `tickets` collection
                        foreignField: '_id',          // Field from the `formDetails` collection
                        as: 'formDetailsInfo'         // Alias for the joined documents
                    }
                },
                {
                    $unwind: '$formDetailsInfo'     // Deconstruct the array of joined documents
                },
                {
                    $group: {
                        _id: '$formDetailsInfo.system', // Group by the `system` field from `formDetailsInfo`
                        count: { $sum: 1 },             // Count the number of occurrences
                        maxDate: { $max: "$dateFromTimeStamp" }, // Find the maximum date
                        createAt: { $last: "$createAt" } // Ensure the latest `createAt` field in the group
                    }
                },
                {
                    $project: {
                        _id: 0,                        // Exclude the `_id` field from the result
                        system: '$_id',                // Rename `_id` to `system`
                        createAt: { $dateToString: { format: "%m", date: "$maxDate" } },  // Format max date
                        count: 1                       // Include the count field
                    }
                }
            );
        } else {
            pipeline.push(
                {
                    $addFields: {
                        dateFromTimeStamp: {
                            $dateFromString: {
                                dateString: "$createAt",
                                format: "%Y-%d-%m %H:%M:%S",
                                onError: null,
                                onNull: null
                            }
                        }
                    }
                },
                {
                    $match: {
                        sectionHeadStatus: { $ne: 'draft' }  // Filter out documents where sectionHeadStatus is 'draft'
                    }
                },
                {
                    $lookup: {
                        from: 'formDetails',          // The collection to join with
                        localField: 'formId',         // Field from the `tickets` collection
                        foreignField: '_id',          // Field from the `formDetails` collection
                        as: 'formDetailsInfo'         // Alias for the joined documents
                    }
                },
                {
                    $unwind: '$formDetailsInfo'     // Deconstruct the array of joined documents
                },
                {
                    $group: {
                        _id: '$formDetailsInfo.system', // Group by the `system` field from `formDetailsInfo`
                        count: { $sum: 1 },             // Count the number of occurrences
                        maxDate: { $max: "$dateFromTimeStamp" }, // Find the maximum date
                        createAt: { $last: "$createAt" } // Ensure the latest `createAt` field in the group
                    }
                },
                {
                    $project: {
                        _id: 0,                        // Exclude the `_id` field from the result
                        system: '$_id',                // Rename `_id` to `system`
                        createAt: { $dateToString: { format: "%m", date: "$maxDate" } },  // Format max date
                        count: 1                       // Include the count field
                    }
                }
            );
        }
        return pipeline;
    },
    optimizedLogsSystemPipeline: (s, e) => {
        const pipeline = [];
        pipeline.push(
            {
                $addFields: {
                    dateFromTimeStamp: {
                        $dateFromString: {
                            dateString: "$createAt",
                            format: "%Y-%d-%m %H:%M:%S",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $match: {
                    dateFromTimeStamp: {
                        $gte: new Date(module.exports.formatDate(s, e)[0]), // Start date is inclusive
                        $lte: new Date(module.exports.formatDate(s, e)[1])  // End date is inclusive
                    },
                    sectionHeadStatus: { $ne: 'draft' }
                }
            },
            {
                $lookup: {
                    from: 'formDetails',
                    localField: 'formId',
                    foreignField: '_id',
                    as: 'formDetailsInfo'
                }
            },
            {
                $unwind: '$formDetailsInfo'
            },
            // Group by both system and dateFromTimeStamp (day level)
            {
                $group: {
                    _id: {
                        system: '$formDetailsInfo.system',
                        date: { $dateToString: { format: "%d", date: "$dateFromTimeStamp" } }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    system: '$_id.system',
                    createAt: '$_id.date',
                    count: 1
                }
            }
        );

        return pipeline;
    },
    optimizedGetUserDataPipeline: (s, e) => {
        const pipeline = [];
        pipeline.push(
            {
                $addFields: {
                    dateFromTimeStamp: {
                        $dateFromString: {
                            dateString: "$time_stamp",
                            format: "%Y-%d-%m %H:%M:%S",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $project: {
                    time_stamp: 1,
                    unitabbr: 1,
                    user_code: 1,
                    dateFromTimeStamp: 1
                }
            },
            {
                $match: {
                    dateFromTimeStamp: {
                        $gte: new Date(module.exports.formatDate(s, e)[0]), // Start date is inclusive
                        $lte: new Date(module.exports.formatDate(s, e)[1])  // End date is inclusive
                    }
                }
            },
            {
                $group: {
                    _id: "$user_code",
                    unitabbr: { $first: "$unitabbr" },
                    count: { $sum: 1 },
                    maxTimeStamp: { $max: "$time_stamp" }  // Find the latest time_stamp
                }
            },
            {
                $addFields: {
                    date: {
                        $dateFromString: {
                            dateString: "$maxTimeStamp",
                            format: "%Y-%d-%m %H:%M:%S",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    unitabbr: 1,
                    count: 1,
                    date: 1 // Include the calculated date field
                }
            },
            {
                $sort: { count: -1 }  // Sort by count in descending order
            }
        );
        return pipeline;
    },
    optimizedGetRevenuDataPipeline: (s, e) => {
        const pipeline = [];
        pipeline.push(
            {
                $addFields: {
                    dateFromTimeStamp: {
                        $dateFromString: {
                            dateString: "$createAt",
                            format: "%Y-%d-%m %H:%M:%S",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $match: {
                    dateFromTimeStamp: {
                        $gte: new Date(module.exports.formatDate(s, e)[0]), // Start date is inclusive
                        $lte: new Date(module.exports.formatDate(s, e)[1])  // End date is inclusive
                    },
                    sectionHeadStatus: { $ne: 'draft' }
                }
            },
            {
                $lookup: {
                    from: 'formDetails',
                    localField: 'formId',
                    foreignField: '_id',
                    as: 'formDetailsInfo'
                }
            },
            {
                $unwind: '$formDetailsInfo'
            },
            // Group by both system and dateFromTimeStamp (day level)
            {
                $group: {
                    _id: {
                        system: '$formDetailsInfo.system',
                        date: { $dateToString: { format: "%d", date: "$dateFromTimeStamp" } }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    system: '$_id.system',
                    createAt: '$_id.date',
                    count: 1
                }
            }
        );
        return pipeline;
    },
    GetDataRequest: (module) => {
        const pipeline = [];
        const modules = Array.isArray(module)
            ? module
            : typeof module === 'string'
                ? [module]
                : [];
        // Match on the 'module' if provided
        if (modules.length > 0) {
            pipeline.push({
                $match: {
                    system: { $in: modules }
                }
            });
        }
        // Perform the join (lookup) with the 'tickets' collection
        pipeline.push({
            $lookup: {
                from: 'tickets',  // Name of the 'tickets' collection
                localField: '_id', // Field from 'formDetails' collection
                foreignField: 'formId',  // Field from 'tickets' collection
                as: 'tickets'   // Output array of matched documents from 'tickets'
            }
        });
        // Add a $match stage to exclude tickets with 'sectionHeadStatus' as 'draft'
        pipeline.push({
            $addFields: {
                tickets: {
                    $filter: {
                        input: '$tickets',
                        as: 'ticket',
                        cond: { $ne: ['$$ticket.sectionHeadStatus', 'draft'] }
                    }
                }
            }
        });
        // Optionally, use $unwind to flatten the 'tickets' array if needed
        pipeline.push({
            $unwind: {
                path: '$tickets',  // Unwind the 'tickets' array if needed
                preserveNullAndEmptyArrays: true  // Keep the documents even if no match is found
            }
        });
        return pipeline;
    }
}