// Define the number of users and their contribution amounts
const numberOfUsers = 100000;
const luckyContribution = 550;
const unluckyContribution = 50;
const distributionAmount = 1000000; // Amount to distribute to each lucky user

// Initialize variables
let totalLuckyUsers = 0;
let remainingUsers = numberOfUsers;
let remainingAmount = 0;
let dayCounter = 0;

// Create an array to store each user's contribution and lucky status
const userContributions = Array.from({ length: numberOfUsers }, () => ({ contribution: 0, lucky: false }));

// Define a function to simulate daily distribution
function distributeDaily() {
    const startAt = Date.now();
    dayCounter += 1;

    // Calculate the total contribution for the day
    let totalContribution = (totalLuckyUsers * luckyContribution) + (remainingUsers * unluckyContribution) + remainingAmount;

    // Calculate the number of lucky users for this distribution
    const currentLuckyUsers = Math.floor(totalContribution / distributionAmount);

    // Calculate the remaining amount after distributing to lucky users
    remainingAmount = totalContribution % distributionAmount;

    // Update the total number of lucky users
    totalLuckyUsers += currentLuckyUsers;
    // Mark the first totalLuckyUsers users as lucky in the userContributions array
    for (let i = totalLuckyUsers - currentLuckyUsers; i < totalLuckyUsers; i++) {
        // console.log(`Lucky user # ${i}`);
        userContributions[i].lucky = true;
    }

    // Update the number of remaining users (excluding those who are already lucky)
    remainingUsers = numberOfUsers - totalLuckyUsers;

    // Adjust remaining users based on those who have already contributed the distribution amount
    remainingUsers = Math.max(remainingUsers, 0); // Ensure remaining users is not negative

    // Update each user's contribution and lucky status
    for (let i = 0; i < userContributions.length; i++) {
        if (userContributions[i].contribution < distributionAmount && remainingUsers > 0) {
            if (userContributions[i].lucky == false) {
                // console.log(`unlucky`);
                userContributions[i].contribution += unluckyContribution;
            } else {
                // console.log(`lucky`);
                userContributions[i].contribution += luckyContribution;
            }
            // console.log(`user # ${i}`);
            // console.log(`contribution # ${userContributions[i].contribution}`);
        }
        else if (userContributions[i].contribution >= distributionAmount) {
            console.log(`user # ${i} finished`);
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
        timeTaken: timeTaken.toFixed(2), // Time taken for the distribution in seconds
        userContributions: userContributions.slice() // Copy the array to prevent modifying the original
    };

    console.log("Distribution for day", dayCounter);
    console.log(distribution);

    // Modify the condition to check if all users are lucky
    if (!allUsersAreLucky()) {
        distributeDaily()
        // If not all users are lucky, schedule the next day's distribution
        // setTimeout(distributeDaily, 10000); // Schedule the next distribution after 10 seconds
    }
    else{
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
