
const joinArray = (resultTicketDataForm, resultDataForm) => {
    return resultTicketDataForm.map(approval => {
        const form = resultDataForm.find(f => f._id.equals(approval.formId));
        if (!form) {
            console.error(`Form with ID ${approval.formId} not found.`);
            return null;  // or handle it as per your requirement
        }
        return {
            _id: approval._id,
            formId: form._id,
            coordinatorName: form.coordinatorName,
            requesterEmail: form.requesterEmail,
            requesterCode: form.requesterCode,
            workType: form.workType,
            benefits: form.benefits,
            department: form.department,
            natureOfWork: form.natureOfWork,
            contactNumber: form.contactNumber,
            jobName: form.jobName,
            objectives: form.objectives,
            jobDetails: form.jobDetails,
            ValueTarget: form.ValueTarget,
            ValuePlatform: form.ValuePlatform,
            ValueImpact: form.ValueImpact,
            ValueCompliance: form.ValueCompliance,
            ValuePeriod: form.ValuePeriod,
            fileName: form.fileName,
            fileName1: form.fileName1,
            sectionHeadComment: form.sectionHeadComment,
            departmentHeadComment: form.departmentHeadComment,
            system: form.system,
            sectionHeadCode: approval.sectionHeadCode,
            departmentHeadCode: approval.departmentHeadCode,
            sectionHeadStatus: approval.sectionHeadStatus,
            departmentHeadStatus: approval.departmentHeadStatus,
            maxLevelApprover: approval.maxLevelApprover,
            createAt: approval.createAt,
            updateAt: approval.updateAt,
            ticketId: approval.ticketId,
            FileNameServer: form.FileNameServer,
            FileNameServer1: form.FileNameServer1,
            sectionHeadComment: form.sectionHeadComment,
            departmentHeadComment: form.departmentHeadComment,
            connecterRequest: form.connecterRequest,
            ApprovedBy: form.ApprovedBy,
            budget: form.budget,
            budgetUsed: form.budgetUsed,
            systemRequested: form.systemRequested,
            usageReason: form.usageReason,
            access: form.access,
            actionLine: approval.actionLine,
            comment: form.comment,
        };
    }).filter(item => item !== null);
}

module.exports = { joinArray }