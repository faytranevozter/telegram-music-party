export const validateConfigNumber = (value: string, min = 1): string => {
    if (isNaN(parseInt(value))) {
        return '⚠️ Please provide a valid number.';
    }

    if (parseInt(value) < min) {
        return `⚠️ Value must be greater than or equal to ${min}.`;
    }

    return '';
};
