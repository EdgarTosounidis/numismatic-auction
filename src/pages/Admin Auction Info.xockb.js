import wixData from 'wix-data';
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';

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
            $w('#points').text = `Your Points: ${userPoints}`;
        })
        .catch((error) => {
            console.error("Error fetching member data: ", error);
        });

    // Disable the pre-bid button initially
    $w("#bidButton").disable();

    // Call checkForUpdates to display the highest bidder message
    //checkForUpdates();
});

export function submitButton_click(event) {
    const newPrice = parseFloat($w("#liveBid").value);
    const preBidAmount = parseFloat(event.target.value);
    const currentBid = parseFloat($w("#bidAmount").text);
    const coinName = $w("#coinName").text;

    // Validate pre-bid amount
    if (preBidAmount <= currentBid || preBidAmount > userPoints) {
        $w("#liveBidError").text = `Error: Pre-bid amount must be greater than the current bid (${currentBid}) and less than or equal to your current points (${userPoints}).`;
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
    // Add an event handler for the button click
    $w("#bidButton").onClick(updateNumber);

    // Periodically check for updates
    //setInterval(checkForUpdates, 4000); // Check every 4 seconds (adjust as needed)
});

function updateNumber() {
    // Get the new number from the input field
    const newNumber = $w("#liveBid").value;

    // Extract lot number from URL
    const url = wixLocation.url;
    const lotNumber = Number(getLotNumberFromURL(url));

    // Fetch user data
    const currentUser = wixUsers.currentUser;
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

                        // Update the item with the new bid amount and other fields
                        wixData.update("AuctionItems", {
                                "_id": currentItem._id,
                                "currentBid": newNumber,
                                "bidderId": currentUser.id, // Use currentUser.id instead of user.id
                                "bidCount": currentItem.bidCount,
                                // Include other existing fields here
                                "time": currentItem.time,
                                "itemName": currentItem.itemName,
                                "lotNumber": currentItem.lotNumber,
                                "lotImages": currentItem.lotImages,
                                "lotName": currentItem.lotName,
                                "lotDescription": currentItem.lotDescription,
                                "preBid": currentItem.preBid,
                                "email": memberData.loginEmail,
                                "firstName": memberData.firstName,
                                "lastName": memberData.lastName,
                                "approved": memberData.approved,
                                "denied": memberData.denied,
                            })
                            .then(() => {
                                console.log("Number and bidder ID updated successfully!");
                                // You can add additional actions or feedback here
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
            const previousBidderId = results.items[0].bidderId;

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

            wixData.update("NewDataset", {
                    "_id": previousBidderRecord._id,
                    "userCredits": previousBidderPoints,
                    //Include other fields as needed
                    "emailField": previousBidderRecord.emailField,
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
                        "time": currentItem.time,
                        "title": currentItem.title,
                        "currentBid": currentItem.currentBid,
                        "preBid": currentItem.preBid,
                        "bidderId": currentItem.bidderId,
                        "email": currentItem.email,
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
                        setInterval(checkForUpdates, 4000); // Call checkForUpdates when the bidButton is clicked
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
});

function updateUserPointsDisplay(points) {
    $w('#points').text = `Your Points: ${points}`;
}

function checkForUpdates() {
    // Extract lot number from URL
    const url = wixLocation.url;
    const lotNumber = Number(getLotNumberFromURL(url));
    // Query the collection and update the displayed value on the page
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            const currentBid = results.items[0].currentBid;
            const bidderId = results.items[0].bidderId;

            // Update the bid amount on the page
            $w("#bidAmount").text = currentBid;
            //setInterval(checkForUpdates, 4000);

            // Check if the current user is the highest bidder
            if (bidderId === user.id) {
                $w("#bidStatusMessage").text = "Congratulations! You are the highest bidder!";
                $w("#bidStatusMessage").show(); // Show the message
            } else {
                $w("#bidStatusMessage").text = ""; // Clear the message
                $w("#bidStatusMessage").hide(); // Hide the message
            }
        })
        .catch((err) => {
            console.error("Error checking for updates: ", err);
            // Handle errors or provide feedback to the user
        });
}

// Function to handle the auto bid logic
function handleAutoBid(autoBidAmount) {
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
}

// Function to initiate the auto bid process
function autoBid() {
    // Extract lot number from URL
    const url = wixLocation.url;
    const lotNumber = Number(getLotNumberFromURL(url));
    // Get the current bid amount from the collection
    wixData.query("AuctionItems")
        .eq("lotNumber", lotNumber)
        .find()
        .then((results) => {
            const currentBid = parseFloat(results.items[0].currentBid);

            // Calculate the auto bid amount (10 above the current bid)
            const autoBidAmount = currentBid + 10;

            // Update the liveBid input field with the new auto bid amount
            $w("#liveBid").value = autoBidAmount.toString();

            // Call checkForUpdates when the bidButton is clicked
            setInterval(checkForUpdates, 2000);

            // Perform the auto bid logic
            handleAutoBid(autoBidAmount);
        })
        .catch((err) => {
            console.error("Error retrieving data from the collection: ", err);
            // Handle errors or provide feedback to the user
        });
    updateUserPointsDisplay(userPoints);
}