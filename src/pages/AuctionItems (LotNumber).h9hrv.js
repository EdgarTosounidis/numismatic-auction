import wixData from 'wix-data';
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import { triggeredEmails } from 'wix-crm-frontend';
//triggered emails youtube video: https://www.youtube.com/watch?v=waTRdOaXsAA&t=210s&ab_channel=TheWixWiz

let user; // Declare user outside of the onReady function
let userPoints; // Declare userPoints outside of the onReady function
let auctionStarted = false; // Add this variable
let bidButtonClicked = false; // Declare a global variable to track bid button clicks
let updateTimerInterval;
let countdownInterval; // Variable to hold the interval ID for the countdown
const url = wixLocation.url;
const lotNumber = Number(getLotNumberFromURL(url));

function getLotNumberFromURL(url) {
    const regex = /auctionitems\/(\d+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

let auctionDateStr;
let auctionDate;
let currentDate;
let timeDiff;
let currentItem;

wixData.query("AuctionItems")
    .eq("lotNumber", lotNumber)
    .find()
    .then((results) => {
        console.log("failed");
        const auctionDateStr = results.items[0].time; // Assuming 'time' is the field storing the auction date

        // Parse the auction date string into a Date object
        auctionDate = new Date(auctionDateStr);

        // Store the current item for later use
        currentItem = results.items[0];

        // Call output2 function initially
        output2();
    })
    .catch((error) => {
        console.error("Error fetching auction date: ", error);
    });

// Define output2 function
function output2() {
    // Compare the current date with the auction date
    const currentDate = new Date();
    timeDiff = auctionDate.getTime() - currentDate.getTime();

    if (timeDiff >= 0) {
        const additionalMinutes = Math.max(0, 5 - Math.ceil(timeDiff / (1000 * 60)));

        if (bidButtonClicked && timeDiff <= 300000 && additionalMinutes > 0) {
            auctionDate.setTime(auctionDate.getTime() + (additionalMinutes * 60 * 1000));
            bidButtonClicked = false;

            // Update auction date
            wixData.update("AuctionItems", {
                    _id: currentItem._id, // Correctly reference _id from currentItem
                    time: auctionDate, // Ensure date is in a format suitable for Wix Data
                    "lotNumber": lotNumber,
                    "bidderId": currentItem.id,
                    "bidCount": currentItem.bidCount,
                    // Include other existing fields here
                    "bidIncrement": currentItem.bidIncrement,
                    "itemName": currentItem.itemName,
                    "lotImages": currentItem.lotImages,
                    "lotName": currentItem.lotName,
                    "lotDescription": currentItem.lotDescription,
                })
                .then(() => {
                    console.log("Auction date increased by 5 minutes successfully.");
                })
                .catch((error) => {
                    console.error("Error updating auction date: ", error);
                });
        }

        // Calculate time difference
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
        const seconds = Math.floor((timeDiff / 1000) % 60);

        // Update timer display
        $w('#lotTimer').text = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else {
        // Auction has already started, hide the countdown timer
        $w('#lotTimer').hide();
        $w('#group5').hide();
        clearInterval(updateTimerInterval);
    }
}

// Start the updateTimerInterval to call output2 every second
let updTimerInterval = setInterval(output2, 1000);

$w.onReady(function () {
    user = wixUsers.currentUser;

    // Query the user's data
    wixData.query("NewDataset")
        .eq("_owner", user.id)
        .eq("approved", true) // Filter for approved submissions
        .descending("_createdDate") // Sort by creation date in descending order
        .limit(1) // Limit to only one result (the most recent one)
        .find()
        .then((results) => {
            const memberData = results.items[0]; // Get the member's data

            // Assuming 'phones' is the field storing points (replace with your actual field name)
            userPoints = memberData.userCredits || 0;

            // Display user points on the page
            $w('#points').text = `Your Credits: ${userPoints}`;
        })
        .catch((error) => {
            console.error("Error fetching member data: ", error);
            $w("#autoBid").disable();
        });

    // Disable the pre-bid button initially
    $w("#bidButton").disable();

    // Call checkForUpdates to display the highest bidder message
    //checkForUpdates();
});

// Event handler for Auto Bid button click
// Check for updates every 4 seconds
checkAndUpdateLiveBidVisibility();

let dateChecker = 0;

function checkAndUpdateLiveBidVisibility() {
    // Query the auction date
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            console.log("liveBidVisibility Executed");
            const auctionDateStr = results.items[0].time; // Assuming 'time' is the field storing the auction date

            // Parse the auction date string into a Date object
            const auctionDate = new Date(auctionDateStr);

            // Compare the current date with the auction date
            const currentDate = new Date();
            if (dateChecker == 0) {
                console.log("Current Date:", currentDate);
                console.log("Auction Date:", auctionDate);
                dateChecker++;
            }

            if (currentDate >= auctionDate) {
                // Set the auctionStarted variable to true
                auctionStarted = true;
                $w("#group5").hide();
                $w('#lotClosed').text = "Lot Closed";

                // Show the live bid input and button
                /*/$w("#liveBid").show();
                $w("#bidButton").show();/*/
            } else {
                // Hide the live bid input and button
                $w("#group5").show();
            }
        })
        .catch((error) => {
            console.error("Error fetching auction date: ", error);
        });
}

// Event handler for pre-bid input field
$w("#liveBid").onInput((event) => {
    const liveBidAmount = parseFloat(event.target.value);
    const currentBid = parseFloat($w("#bidAmount").text);

    // Validate liveBid amount
    if (liveBidAmount <= currentBid || liveBidAmount > userPoints) {
        if (userPoints == undefined) {
            $w("#liveBidError").text = `Please request for more credits from your profile`;
        } else {
            $w("#liveBidError").text = `Error: Bid amount must be a valid number, greater than the current bid (${currentBid}), and less than or equal to your current credits (${userPoints}).`;
        }
        $w("#bidButton").disable(); // Disable the bid button
    } else if (isNaN(liveBidAmount)) {
        $w("#liveBidError").text = ""; // Clear error message
    } else {
        $w("#liveBidError").text = ""; // Clear error message
        $w("#bidButton").enable(); // Enable the bid button
    }
});

function checkBidStatusAndDisplayMessage(lotNumber, userId) {
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            if (results.items.length > 0) {
                const currentItem = results.items[0];
                // Assuming the auction is closed, check if the currentUser is the winner
                const auctionClosed = new Date() > new Date(currentItem.time); // Check if auction date is in the past

                if (auctionClosed && currentItem.bidderId === userId) {
                    console.log("Winner");
                    $w("#wonMessage").text = "Congratulations! You have won the lot!";
                    $w("#wonMessage").show();
                    //console.log(lotNumber, ", ", currentItem.firstName, ", ", currentItem.lastName, ", ", currentItem.email);
                    // Send email to the user
                    triggeredEmails.emailMember('lotWinner', userId, {
                        variables: {
                            lotNumber: lotNumber,
                            firstName: currentItem.firstName,
                            lastName: currentItem.lastName,
                            email: currentItem.email
                        }
                    });
                }
                if (currentItem.bidderId == userId) {
                    $w("#bidStatusMessage").text = "Congratulations! You are the highest bidder!";
                    $w("#bidStatusMessage").show();
                }
            } else {
                console.error("No auction item found for the specified lot number.");
            }
        })
        .catch((error) => {
            console.error("Error querying auction items: ", error);
        });
}

export function submitButton_click(event) {
    const newPrice = parseFloat($w("#liveBid").value);
    const preBidAmount = parseFloat(event.target.value);
    const currentBid = parseFloat($w("#bidAmount").text);
    const coinName = $w("#coinName").text;

    // Validate pre-bid amount
    if (preBidAmount <= currentBid || preBidAmount > userPoints) {
        $w("#liveBidError").text = `Error: Pre-bid amount must be greater than the current bid (${currentBid}) and less than or equal to your current credits (${userPoints}).`;
        $w("#bidButton").disable();
    } else {
        $w("#liveBidError").text = "";
        $w("#bidButton").enable();

        // Subtract points from the user
        const updatedPoints = userPoints - newPrice;

        // Update the user's points and store user ID in the new collection
        wixData.update("NewDataset", {
                "_id": user.id,
                "mainPhone": updatedPoints,
                // Do not include "emailField", "lastName", and "firstName" here
                "firstName": user.firstName,
                "lastName": user.lastName,
                "bidderId": user.id,
                "phoneNumber": user.mainPhone,
                "emailField": user.emailField,
                "approved": user.approved,
                "denied": user.denied,
            })
            .then(() => {
                // Now you can proceed with updating the bid amount in the "AuctionItems" collection
                updateNumber();
            });
    }
}

$w.onReady(function () {
    // Ensure user and lotNumber are set
    user = wixUsers.currentUser;
    const lotNumber = Number(getLotNumberFromURL(wixLocation.url)); // Ensure this runs correctly

    // Now call the function with necessary parameters
    checkBidStatusAndDisplayMessage(lotNumber, user.id);
    checkForUpdates();

    // Periodically check for updates
    //setInterval(checkForUpdates, 10000); // Error Causer (Sends too many requests to my website)
});

function updateNumber() {
    // Get the new number from the input field
    const newNumber = $w("#liveBid").value;

    // Fetch user data
    const currentUser = wixUsers.currentUser;
    console.log("updateNumber executed");

    wixData.query("Members/PrivateMembersData")
        .eq("_id", currentUser.id)
        .find()
        .then((results) => {
            const memberData = results.items[0];

            // Update the database with the _id property, bidder ID, and other existing fields
            wixData.query("AuctionItems")
                .eq("lotNumber", lotNumber) // Add this condition to match the lot number
                .find()
                .then((results) => {
                    // Check if there are items in the results
                    if (results.items && results.items.length > 0) {
                        const currentItem = results.items[0];
                        const previousBidAmount = currentItem.currentBid;
                        const previousBidderId = currentItem.bidderId;
                        console.log("previousBidder: ", previousBidderId, ", previousBidderAmount: ", previousBidAmount);

                        // Update the item with the new bid amount and other fields
                        wixData.update("AuctionItems", {
                                "_id": currentItem._id,
                                "currentBid": newNumber,
                                "bidderId": currentUser.id, // Use currentUser.id instead of user.id
                                "bidCount": currentItem.bidCount,
                                // Include other existing fields here
                                "bidIncrement": currentItem.bidIncrement,
                                "time": currentItem.time,
                                "itemName": currentItem.itemName,
                                "lotNumber": currentItem.lotNumber,
                                "lotImages": currentItem.lotImages,
                                "lotName": currentItem.lotName,
                                "lotDescription": currentItem.lotDescription,
                                "preBid": currentItem.preBid,
                                "phoneNumber": memberData.mainPhone,
                                "email": memberData.loginEmail,
                                "firstName": memberData.firstName,
                                "lastName": memberData.lastName,
                                "approved": memberData.approved,
                                "denied": memberData.denied,
                            })
                            .then(() => {
                                console.log("Number and bidder ID updated successfully!");
                                if (previousBidderId && previousBidderId !== currentUser.id) {
                                    triggeredEmails.emailMember('outbidEmail', previousBidderId, {
                                        variables: {
                                            currentBid: newNumber,
                                            //add previous bid amount
                                            lotNumber: lotNumber
                                        }
                                    });
                                }

                            })
                            .catch((err) => {
                                console.error("Error updating number and bidder ID: ", err);
                                // Handle errors or provide feedback to the user
                            });
                    } else {
                        console.error("No items found in the 'AuctionItems' collection for the given lot number.");
                    }
                })
                .catch((err) => {
                    console.error("Error retrieving data from the 'AuctionItems' collection: ", err);
                    // Handle errors or provide feedback to the user
                });
        });
}

function subtractPoints(newBidAmount) {
    // Get the current bid amount and bidderId from the collection
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            const auctionDateStr = results.items[0].time;
            const auctionDate = new Date(auctionDateStr);
            const currentDate = new Date();
            const currentBid = parseFloat(results.items[0].currentBid);
            const bidderId = results.items[0].bidderId;
            const previousBidderId = results.items[0].bidderId;

            //console.log("previous Bidder:", previousBidderId); //previousBidder
            /*/if (currentDate >= auctionDate && previousBidderId ) {
            }/*/

            if (currentDate >= auctionDate && bidderId === user.id) {
                // Display a message to the user indicating they have won the lot
                $w("#bidStatusMessage").text = "Congratulations! You have won the lot!";
                $w("#bidStatusMessage").show(); // Show the message
            }
            // Check if the user outbids themselves
            if (bidderId === user.id) {
                // Calculate the difference between the new bid amount and the current bid
                const bidDifference = newBidAmount - currentBid;

                // If the user outbids themselves, subtract only the difference
                if (bidDifference > 0 && bidDifference <= userPoints) {
                    // Subtract only the difference in points
                    userPoints -= bidDifference;

                    // Display a message to the user
                    $w("#bidStatusMessage").text = "Congratulations! You are the highest bidder.";
                    $w("#bidStatusMessage").show(); // Show the message
                } else {
                    // Handle the case where the bid is not valid (e.g., insufficient points)
                    console.error("Invalid bid or insufficient points.");
                    // You may want to provide feedback to the user in the UI
                    return; // Exit the function if the bid is invalid
                }
            } else {
                returnPointsToBidder(previousBidderId, currentBid);
                // Directly subtract the new bid amount from the user's points
                if (newBidAmount <= userPoints) {
                    userPoints -= newBidAmount;
                } else {
                    // Handle the case where the bid is not valid (e.g., insufficient points)
                    console.error("Invalid bid or insufficient points.");
                    // You may want to provide feedback to the user in the UI
                    return; // Exit the function if the bid is invalid
                }
            }

            // Update the user's points in the "NewDataset" collection
            wixData.query("NewDataset") // Make sure to use the correct collection name
                .eq("_owner", user.id)
                .eq("approved", true) // Filter for approved submissions
                .descending("_createdDate") // Sort by creation date in descending order
                .limit(1) // Limit to only one result (the most recent one)
                .find()
                .then((userResults) => {
                    const userRecord = userResults.items[0];

                    // Update the userCredits field with the new userPoints value
                    wixData.update("NewDataset", {
                            "_id": userRecord._id,
                            "userCredits": userPoints,
                            "emailField": userRecord.emailField, // Use the correct field name
                            "phoneNumber": userRecord.mainPhone,
                            "firstName": userRecord.firstName,
                            "lastName": userRecord.lastName,
                            "approved": userRecord.approved,
                            "denied": userRecord.denied,
                        })
                        .then(() => {
                            console.log("User credits updated successfully.");

                            // Proceed with updating the bid amount in the "AuctionItems" collection
                            //updateNumber();

                            // Clear the liveBid input field after a successful bid
                            $w("#liveBid").value = "";

                            if (userPoints == undefined) {
                                // Update the displayed user points on the page
                                $w('#points').text = `Your Credits: 0`;
                            } else {
                                $w('#points').text = `Your Credits: ${userPoints}`;
                            }

                        })
                        .catch((err) => {
                            console.error("Error updating user points and field: ", err);
                        });
                })
                .catch((error) => {
                    console.error("Error fetching user record: ", error);
                });
        })
        .catch((err) => {
            console.error("Error retrieving data from the collection: ", err);
            // Handle errors or provide feedback to the user
        });
    updateUserPointsDisplay(userPoints);
}

function returnPointsToBidder(bidderId, amount) {
    // Add logic here to return the bid amount to the previous bidder
    // Use bidderId and amount to update the points for the previous bidder
    // You can follow a similar pattern as subtractPoints function

    // Example:
    wixData.query("NewDataset")
        .eq("_owner", bidderId)
        .eq("approved", true) // Filter for approved submissions
        .descending("_createdDate") // Sort by creation date in descending order
        .limit(1) // Limit to only one result (the most recent one)
        .find()
        .then((previousBidderResults) => {
            const previousBidderRecord = previousBidderResults.items[0];
            const previousBidderPoints = previousBidderRecord.userCredits + amount;

            console.log(previousBidderRecord);

            wixData.update("NewDataset", {
                    "_id": previousBidderRecord._id,
                    "userCredits": previousBidderPoints,
                    //Include other fields as needed
                    "emailField": previousBidderRecord.emailField,
                    "phoneNumber": previousBidderRecord.mainPhone,
                    "lastName": previousBidderRecord.lastName,
                    "firstName": previousBidderRecord.firstName,
                    "approved": previousBidderRecord.approved,
                    "denied": previousBidderRecord.denied,
                })
                .then(() => {
                    console.log("Points returned to the previous bidder successfully.");
                })
                .catch((updateError) => {
                    console.error("Error updating points for the previous bidder: ", updateError);
                });
        })
        .catch((error) => {
            console.error("Error fetching previous bidder record: ", error);
        });
    // Update the displayed user points on the page
    updateUserPointsDisplay(userPoints);
}

//Event handler for the button click
$w("#bidButton").onClick(() => {
    bidButtonClicked = true; // Set the flag when the bid button is clicked
    const newBidAmount = parseFloat($w("#liveBid").value);
    let currentValue = parseFloat($w("#liveBid").value);

    // Disable the pre-bid button initially
    $w("#bidButton").disable();

    // For example, you might want to reset the flag after processing the bid
    setTimeout(() => {
        bidButtonClicked = false;
    }, 5000); // Reset the flag after 5 seconds (adjust as needed)

    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = undefined; // Reset the interval variable
    }

    // Query the "AuctionItems" dataset to find the corresponding row
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            // Check if there are items in the results
            if (results.items && results.items.length > 0) {
                const currentItem = results.items[0];

                // Increment the bid count
                const currentBidCount = currentItem.bidCount || 0;
                const bidCount = currentBidCount + 1; // Increment by 1

                // Update the bid count in the "AuctionItems" dataset
                wixData.update("AuctionItems", {
                        "_id": currentItem._id,
                        "bidCount": bidCount,
                        // Include other existing fields here
                        "bidIncrement": currentItem.bidIncrement,
                        "time": currentItem.time,
                        "title": currentItem.title,
                        "currentBid": currentItem.currentBid,
                        "preBid": currentItem.preBid,
                        "bidderId": currentItem.bidderId,
                        "email": currentItem.email,
                        "phoneNumber": currentItem.mainPhone,
                        "itemName": currentItem.itemName,
                        "lotImages": currentItem.lotImages,
                        "lotName": currentItem.lotName,
                        "lotDescription": currentItem.lotDescription,
                        "firstName": currentItem.firstName,
                        "lastName": currentItem.lastName,
                        "approved": currentItem.approved,
                        "denied": currentItem.denied,
                        "auctionDate": currentItem.auctionDate,
                        "lotNumber": currentItem.lotNumber
                    })
                    .then(() => {
                        // After the bid count is updated, subtract points, update number, and check for updates
                        subtractPoints(newBidAmount);
                        updateNumber(); // Call the existing function to update bid amount in the database
                        //setInterval(checkForUpdates, 4000); // Call checkForUpdates when the bidButton is clicked
                        let userId = currentItem.bidderId;
                        triggeredEmails.emailMember('highestBidder', userId, {
                            variables: {
                                lotNumber: lotNumber,
                                currentBid: newBidAmount
                            }
                        });
                    })
                    .catch((updateError) => {
                        console.error("Error updating bid count in AuctionItems dataset: ", updateError);
                    });
            } else {
                console.error("No items found in the 'AuctionItems' collection for the given lot number.");
            }
        })
        .catch((err) => {
            console.error("Error retrieving data from the 'AuctionItems' collection: ", err);
        });
    //updateBidInterval = setInterval(checkForUpdates, 1000);
});

function updateUserPointsDisplay(points) {
    $w('#points').text = `Your Credit: ${points}`;
}

let updateBidInterval;
let counter = 0;

let initialBid; // Variable to store the initial bid amount

// Function to fetch the initial bid amount from the dataset when the page loads
function fetchInitialBid() {
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            // Store the initial bid amount from the dataset
            initialBid = results.items[0].currentBid;
        })
        .catch((error) => {
            console.error("Error fetching initial bid: ", error);
        });
}

// Call fetchInitialBid when the page loads
$w.onReady(() => {
    fetchInitialBid();
});

let currentDatasetBid;

// Function to compare the stored bid with the bid in the dataset and call checkForUpdates if they are not equal
function compareBidAndUpdate() {
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            currentDatasetBid = results.items[0].currentBid;

            // Compare the stored bid with the bid in the dataset
            if (initialBid != currentDatasetBid) {
                // Call checkForUpdates function
                updateBidInterval = setInterval(checkForUpdates, 1000);
                console.log("entered if else statement and checkedForUpdates");

                initialBid = currentDatasetBid;
            }
        })
        .catch((error) => {
            console.error("Error fetching bid data: ", error);
        });
}

// Call compareBidAndUpdate every second
setInterval(compareBidAndUpdate, 1000);

function checkForUpdates() {
    // Query the collection and update the displayed value on the page

    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            const currentBid = results.items[0].currentBid;
            console.log("checkForUpdates executed");
            // Update the bid amount on the page
            $w("#bidAmount").text = currentBid;
            //setInterval(checkForUpdates, 4000);
            counter++;
        })
        .catch((err) => {
            console.error("Error checking for updates: ", err);
            // Handle errors or provide feedback to the user
        });

    if (counter == 1) {
        clearInterval(updateBidInterval);
        counter = 0;
    }
}

// Function to handle the auto bid logic
/*/function handleAutoBid(autoBidAmount) {
    // Extract lot number from URL
    const url = wixLocation.url;
    const lotNumber = Number(getLotNumberFromURL(url));
    // Get the current bid amount and bidderId from the collection
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            const currentBid = parseFloat(results.items[0].currentBid);
            const bidderId = results.items[0].bidderId;
            const email = user.email || user.loginEmail;

            // Check if the user outbids themselves
            if (bidderId === user.id) {
                // Calculate the difference between the new bid amount and the current bid
                const bidDifference = autoBidAmount - currentBid;

                // If the user outbids themselves, subtract only the difference
                if (bidDifference > 0 && bidDifference <= userPoints) {
                    // Subtract only the difference in points
                    userPoints -= bidDifference;

                    // Display a message to the user
                    $w("#bidStatusMessage").text = "Congratulations! You are the highest bidder.";
                    $w("#bidStatusMessage").show(); // Show the message
                } else {
                    // Handle the case where the bid is not valid (e.g., insufficient points)
                    console.error("Invalid bid or insufficient points.");
                    // You may want to provide feedback to the user in the UI
                    return; // Exit the function if the bid is invalid
                }
            } else {
                // Directly subtract the auto bid amount from the user's points
                if (autoBidAmount <= userPoints) {
                    userPoints -= autoBidAmount;
                } else {
                    // Handle the case where the bid is not valid (e.g., insufficient points)
                    console.error("Insufficient points for auto bid.");
                    // You may want to provide feedback to the user in the UI
                    return; // Exit the function if the bid is invalid
                }
            }

            // Update the user's points in the "NewDataset" collection
            wixData.query("NewDataset") // Make sure to use the correct collection name
                .eq("_owner", user.id)
                .eq("approved", true) // Filter for approved submissions
                .descending("_createdDate") // Sort by creation date in descending order
                .limit(1) // Limit to only one result (the most recent one)
                .find()
                .then((userResults) => {
                    const userRecord = userResults.items[0];

                    // Update the userCredits field with the new userPoints value
                    wixData.update("NewDataset", {
                            "_id": userRecord._id,
                            "userCredits": userPoints,
                            "emailField": userRecord.emailField,
                            "phoneNumber": userRecord.mainPhone,
                            "lastName": userRecord.lastName,
                            "firstName": userRecord.firstName,
                            "approved": userRecord.approved,
                            "denied": userRecord.denied
                        })
                        .then(() => {
                            console.log("User credits updated successfully.");

                            // Proceed with updating the bid amount in the "AuctionItems" collection
                            updateNumber();

                            // Clear the liveBid input field after a successful bid
                            $w("#liveBid").value = "";

                            // Update the displayed user points on the page
                            $w('#points').text = `Your Points: ${userPoints}`;

                        })
                        .catch((err) => {
                            console.error("Error updating user points and field: ", err);
                        });
                })
                .catch((error) => {
                    console.error("Error fetching user record: ", error);
                });
        })
        .catch((err) => {
            console.error("Error retrieving data from the collection: ", err);
            // Handle errors or provide feedback to the user
        });
    updateUserPointsDisplay(userPoints);
}/*/

// Function to initiate the auto bid process
$w("#autoBid").onClick(() => {
    //if (userPoints are less than the bid amount error message should come up to the autoBidError)
    bidButtonClicked = true; // Set the flag when the bid button is clicked

    // Disable the pre-bid button initially
    $w("#bidButton").disable();

    setTimeout(() => {
        $w("#autoBid").enable();
    }, 5000); // Reset the flag after 5 seconds (adjust as needed)

    // For example, you might want to reset the flag after processing the bid
    setTimeout(() => {
        bidButtonClicked = false;
    }, 5000); // Reset the flag after 5 seconds (adjust as needed)

    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = undefined; // Reset the interval variable
    }

    // Get the current bid amount and bid increment from the collection
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            if (results.items && results.items.length > 0) {
                const currentBid = parseFloat(results.items[0].currentBid);
                const bidIncrement = parseFloat(results.items[0].bidIncrement); // Assuming 'bidIncrement' is the field storing the increment value
                // Calculate the auto bid amount (current bid plus bid increment)
                const autoBidAmount = currentBid + bidIncrement;
                if (autoBidAmount > userPoints) {
                    // User does not have enough points, show an error message
                    $w("#autoBidError").text = "Error: You do not have enough points to place this bid.";
                    $w("#autoBid").disable();
                    return; // Exit the function to prevent bid from being placed
                } else {

                    const currentItem = results.items[0];
                    const currentBidCount = currentItem.bidCount || 0;
                    const bidCount = currentBidCount + 1; // Increment by 1

                    // Update the liveBid input field with the new auto bid amount
                    $w("#liveBid").value = autoBidAmount.toString();
                    const newBidAmount = parseFloat($w("#liveBid").value);
                    let currentValue = parseFloat($w("#liveBid").value);

                    // Update the bid count in the "AuctionItems" dataset
                    wixData.update("AuctionItems", {
                            "_id": currentItem._id,
                            "bidCount": bidCount,
                            // Include other existing fields here
                            "bidIncrement": currentItem.bidIncrement,
                            "time": currentItem.time,
                            "title": currentItem.title,
                            "currentBid": currentItem.currentBid,
                            "preBid": currentItem.preBid,
                            "bidderId": currentItem.bidderId,
                            "email": currentItem.email,
                            "phoneNumber": currentItem.mainPhone,
                            "itemName": currentItem.itemName,
                            "lotImages": currentItem.lotImages,
                            "lotName": currentItem.lotName,
                            "lotDescription": currentItem.lotDescription,
                            "firstName": currentItem.firstName,
                            "lastName": currentItem.lastName,
                            "approved": currentItem.approved,
                            "denied": currentItem.denied,
                            "auctionDate": currentItem.auctionDate,
                            "lotNumber": currentItem.lotNumber,
                        })
                        .then(() => {
                            // After the bid count is updated, subtract points, update number, and check for updates
                            subtractPoints(newBidAmount);
                            updateNumber(); // Call the existing function to update bid amount in the database
                            //setInterval(checkForUpdates, 4000); // Call checkForUpdates when the bidButton is clicked
                            let userId = currentItem.bidderId;
                            triggeredEmails.emailMember('highestBidder', userId, {
                                variables: {
                                    lotNumber: lotNumber,
                                    currentBid: newBidAmount
                                }
                            });
                        })
                        .catch((updateError) => {
                            console.error("Error updating bid count in AuctionItems dataset: ", updateError);
                        });
                }
            } else {
                console.error("No items found in the 'AuctionItems' collection for the given lot number.");
            }
        })
        .catch((err) => {
            console.error("Error retrieving data from the 'AuctionItems' collection: ", err);
        });
    $w("#autoBid").disable();
});