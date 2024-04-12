// Define the number of users and their contribution amounts
const numberOfUsers = 100000;
let luckyContribution = 550;
const unluckyContribution = 50;
let distributionAmount = 1000000; // Amount to distribute to each lucky user

// Initialize variables
let totalLuckyUsers = 0;
let remainingUsers = numberOfUsers;
let remainingAmount = 0;
let dayCounter = 0;
let finishedUsers = 0;

// Create an array to store each user's contribution and lucky status
const userContributions = Array.from({ length: numberOfUsers }, () => ({ contribution: 0, lucky: false, finished: false, distributionAmount: distributionAmount}));

// Define a function to simulate daily distribution
function distributeDaily() {
    const startAt = Date.now();
    dayCounter += 1;
    // Update distributionAmount based on dayCounter
    if (dayCounter >= 365 * 3) {
        distributionAmount = 500000; // Change distributionAmount to 500,000 after 3 years
        // Update distributionAmount for users who have not been lucky yet
        userContributions.forEach(user => {
            if (!user.lucky) {
                user.distributionAmount = distributionAmount;
            }
        });
    }
    if (dayCounter >= 365 * 5) {
        distributionAmount = 250000; // Change distributionAmount to 250,000 after 5 years
        // Update distributionAmount for users who have not been lucky yet
        userContributions.forEach(user => {
            if (!user.lucky) {
                user.distributionAmount = distributionAmount;
            }
        });
    }
    // Calculate the total contribution for the day
    let totalContribution = (totalLuckyUsers * luckyContribution) + (remainingUsers * unluckyContribution) + remainingAmount;

    // Calculate the number of lucky users for this distribution
    const currentLuckyUsers = Math.floor(totalContribution / distributionAmount);

    // Calculate the remaining amount after distributing to lucky users
    remainingAmount = totalContribution % distributionAmount;

    // Update the total number of lucky users
    totalLuckyUsers += currentLuckyUsers;

    // Update the number of remaining users (excluding those who are already lucky)
    remainingUsers = numberOfUsers - totalLuckyUsers;

    // Adjust remaining users based on those who have already contributed the distribution amount
    remainingUsers = Math.max(remainingUsers, 0); // Ensure remaining users is not negative

    if (totalLuckyUsers < userContributions.length) {
        // console.log(userContributions.length);
        // console.log(totalLuckyUsers);
        // console.log(currentLuckyUsers);
        for (let i = (totalLuckyUsers-currentLuckyUsers); i < totalLuckyUsers; i++) {
            userContributions[i].lucky = true;
            // console.log(userContributions[i]);
        }
    }
    // Update each user's contribution and lucky status
    for (let i = 0; i < userContributions.length; i++) {
        if (userContributions[i].finished == true) {
            continue;
        }
        else if (userContributions[i].contribution < userContributions[i].distributionAmount) {
            if (userContributions[i].lucky == false) {
                userContributions[i].contribution += unluckyContribution;
            } else {
                userContributions[i].contribution += luckyContribution;
            }
            // Check if this contribution completes the user's total distribution amount
            if (userContributions[i].contribution >= userContributions[i].distributionAmount) {
                userContributions[i].finished = true;
                finishedUsers += 1;
            }
        }
    }

    const endAt = Date.now();
    const timeTaken = Math.abs(startAt - endAt) / 1000;
    console.log(`Time Taken: ${timeTaken}`);
    
    // Distribution
    const distribution = {
        day: dayCounter,
        dailyLuckUsers: currentLuckyUsers,
        totalContribution: totalContribution,
        totalluckyUsers: totalLuckyUsers,
        unluckyUsers: remainingUsers,
        totalluckyDistribution: totalLuckyUsers * distributionAmount,
        finishedUsers: finishedUsers,
        timeTaken: timeTaken.toFixed(2), // Time taken for the distribution in seconds
        // userContributions: userContributions.slice() // Copy the array to prevent modifying the original
    };

    console.log("Distribution for day", dayCounter);
    console.log(distribution);

    // Modify the condition to check if all users are lucky
    // if (!allUsersAreLucky()) {
    if (remainingUsers > 0) {
        distributeDaily()
    }
    else {
        const endAt = Date.now();
        const timeTaken = Math.abs(startAt - endAt) / 1000;
        console.log(`Total Time Taken: ${timeTaken}`);
    }
}

// Define a function to check if all users are lucky
function allUsersAreLucky() {
    for (let i = 0; i < userContributions.length; i++) {
        if (!userContributions[i].lucky) {
            return false; // At least one user is not lucky
        }
    }
    return true; // All users are lucky
}

// Start the distribution process
distributeDaily();
