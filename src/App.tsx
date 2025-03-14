import React, { useEffect, useState } from "react";
import Web3 from "web3";
import "./App.css";
import electionAbi from "./contracts/electionAbi.json";
import verifierAbi from "./contracts/verifierAbi.json";
import { ELECTION_ADDRESS, VERIFICATION_ADDRESS } from "./util/constants";
import { ElectionState, Candidate, CandidateBatch } from "./util/types";

function App() {
  // Web3 state
  const [web3, setWeb3] = useState<Web3 | null>(null);
  // eslint-disable-next-line
  const [accounts, setAccounts] = useState<string[]>([]);
  const [currentAccount, setCurrentAccount] = useState<string>("");
  const [isOwner, setIsOwner] = useState<boolean>(false);

  // Contract instances
  const [electionContract, setElectionContract] = useState<any>(null);
  const [verificationContract, setVerificationContract] = useState<any>(null);

  // Election state
  const [electionState, setElectionState] = useState<ElectionState>(
    ElectionState.Preparing
  );
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [electionCount, setElectionCount] = useState<number>(0);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [currentLeader, setCurrentLeader] = useState<{
    id: number;
    name: string;
    votes: number;
  } | null>(null);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Form state
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [unverifyAddress, setUnverifyAddress] = useState<string>("");
  const [candidateBatch, setCandidateBatch] = useState<CandidateBatch[]>([
    { name: "" },
  ]);

  // Past elections state
  const [pastElections, setPastElections] = useState<
    Array<{
      id: number;
      candidates: Candidate[];
      selected: boolean;
    }>
  >([]);

  // Initialize Web3
  useEffect(() => {
    const init = async () => {
      try {
        // Check if MetaMask is installed
        if (window.ethereum) {
          const web3Instance = new Web3(window.ethereum);
          setWeb3(web3Instance);

          // Set up event listeners for MetaMask
          window.ethereum.on("accountsChanged", handleAccountsChanged);
          window.ethereum.on("chainChanged", () => window.location.reload());
        } else {
          setError(
            "MetaMask is not installed. Please install it to use this application"
          );
        }
      } catch (err) {
        alert("Error initializing app: " + err);
        setError("Failed to initialize application");
      } finally {
        setLoading(false);
      }
    };

    init();

    // Cleanup event listeners
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
      }
    };
  }, []);

  // Connect to MetaMask
  const connectWallet = async () => {
    if (!web3) return;

    try {
      setLoading(true);
      // Request account access
      const accs = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccounts(accs);
      setCurrentAccount(accs[0]);

      // Initialize contracts
      const electionInstance = new web3.eth.Contract(
        electionAbi as any,
        ELECTION_ADDRESS
      );

      const verificationInstance = new web3.eth.Contract(
        verifierAbi as any,
        VERIFICATION_ADDRESS
      );

      setElectionContract(electionInstance);
      setVerificationContract(verificationInstance);

      // Load initial data
      await loadContractData(
        web3,
        electionInstance,
        verificationInstance,
        accs[0]
      );

      setSuccessMessage("Connected to MetaMask successfully!");
    } catch (err: any) {
      alert("User denied account access: " + err);
      setError(
        err.message || "Please connect MetaMask to use this application"
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle account changes in MetaMask
  const handleAccountsChanged = async (newAccounts: string[]) => {
    setAccounts(newAccounts);
    if (newAccounts.length === 0) {
      setCurrentAccount("");
      setIsVerified(false);
      setIsOwner(false);
    } else {
      setCurrentAccount(newAccounts[0]);
      // Reload contract data with new account
      if (web3 && electionContract && verificationContract) {
        await loadContractData(
          web3,
          electionContract,
          verificationContract,
          newAccounts[0]
        );
      }
    }
  };

  // Function to load all necessary contract data
  const loadContractData = async (
    web3Instance: Web3,
    electionInstance: any,
    verificationInstance: any,
    account: string
  ) => {
    try {
      // Get contract owner - explicitly compare strings after converting to lowercase
      const owner = await electionInstance.methods.owner().call();
      console.log("Contract owner:", owner);
      console.log("Current account:", account);
      setIsOwner(account.toLowerCase() === owner.toLowerCase());

      // Get election state
      const state = await electionInstance.methods.electionState().call();
      setElectionState(parseInt(state));

      // Get election count
      const count = await electionInstance.methods.electionCount().call();
      setElectionCount(parseInt(count));

      // Get all candidates
      const candidatesList = await electionInstance.methods
        .getAllCandidates()
        .call();
      setCandidates(
        candidatesList.map((c: any) => ({
          id: parseInt(c.id),
          name: c.name,
          voteCount: parseInt(c.voteCount),
        }))
      );

      // Check if user is verified
      const verified = await verificationInstance.methods
        .isUserVerified(account)
        .call();
      setIsVerified(verified);

      // Check if user has voted (if election is active)
      if (parseInt(state) === ElectionState.Active) {
        try {
          // Wrap the hasUserVoted call in its own try-catch to handle potential errors
          const voted = await electionInstance.methods
            .hasUserVoted(account)
            .call();
          setHasVoted(voted);
        } catch (voteErr) {
          console.error("Error checking if user has voted:", voteErr);
          // Default to not voted if there's an error
          setHasVoted(false);
        }

        // Get current leader
        try {
          const leader = await electionInstance.methods
            .getCurrentLeader()
            .call();
          setCurrentLeader({
            id: parseInt(leader.leaderId),
            name: leader.leaderName,
            votes: parseInt(leader.leaderVotes),
          });
        } catch (err) {
          console.log("No leader data available yet");
          setCurrentLeader(null);
        }
      } else {
        setHasVoted(false);
        setCurrentLeader(null);
      }
    } catch (err) {
      console.error("Error loading contract data:", err);
      setError("Failed to load contract data");
    }
  };

  // Refresh data function
  const refreshData = async () => {
    if (web3 && electionContract && verificationContract && currentAccount) {
      setLoading(true);
      await loadContractData(
        web3,
        electionContract,
        verificationContract,
        currentAccount
      );
      setLoading(false);
    }
  };

  // Handle voting
  const handleVote = async () => {
    if (!electionContract || !web3 || !currentAccount) return;
    if (electionState !== ElectionState.Active) {
      setError("Election is not active");
      return;
    }
    if (!isVerified) {
      setError("You are not verified to vote");
      return;
    }
    if (hasVoted) {
      setError("You have already voted");
      return;
    }
    if (!selectedCandidateId) {
      setError("Please select a candidate");
      return;
    }

    try {
      setLoading(true);

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      await electionContract.methods.vote(selectedCandidateId).send({
        from: currentAccount,
        gasPrice: gasPrice, // Add gasPrice to fix EIP-1559 error
      });

      setSuccessMessage("Your vote has been cast successfully!");
      setSelectedCandidateId("");

      // Refresh data after voting
      await refreshData();
    } catch (err: any) {
      alert("Error voting: " + err);
      setError(err.message || "Failed to cast vote");
    } finally {
      setLoading(false);
    }
  };

  // Handle self-verification
  const handleSelfVerify = async () => {
    if (!verificationContract || !web3 || !currentAccount) return;
    if (isVerified) {
      setError("You are already verified");
      return;
    }

    try {
      setLoading(true);

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      await verificationContract.methods.verifySelf().send({
        from: currentAccount,
        gasPrice: gasPrice, // Add gasPrice to fix EIP-1559 error
      });

      setSuccessMessage("You have successfully verified yourself!");

      // Refresh data after verification
      await refreshData();
    } catch (err: any) {
      alert("Error self-verifying: " + err);
      setError(err.message || "Failed to self-verify");
    } finally {
      setLoading(false);
    }
  };

  // Admin functions

  // Handle batch add candidates input change
  const handleCandidateNameChange = (index: number, name: string) => {
    const updatedBatch = [...candidateBatch];
    updatedBatch[index].name = name;
    setCandidateBatch(updatedBatch);
  };

  // Add more candidate input fields
  const addCandidateField = () => {
    setCandidateBatch([...candidateBatch, { name: "" }]);
  };

  // Remove candidate input field
  const removeCandidateField = (index: number) => {
    const updatedBatch = [...candidateBatch];
    updatedBatch.splice(index, 1);
    setCandidateBatch(updatedBatch);
  };

  // Add candidates in batch
  const handleAddCandidatesBatch = async () => {
    if (!electionContract || !web3 || !currentAccount || !isOwner) return;
    if (electionState !== ElectionState.Preparing) {
      setError("Cannot add candidates when election is not in preparing state");
      return;
    }

    // Filter out empty candidate names
    const validCandidates = candidateBatch.filter(
      (candidate) => candidate.name.trim() !== ""
    );

    if (validCandidates.length === 0) {
      setError("At least one candidate with a name is required");
      return;
    }

    try {
      setLoading(true);

      // Get next available IDs starting from max of existing candidates + 1 or 1
      const startId =
        candidates.length > 0
          ? Math.max(...candidates.map((c) => c.id)) + 1
          : 1;

      const candidateIds = Array.from(
        { length: validCandidates.length },
        (_, i) => startId + i
      );

      const candidateNames = validCandidates.map((c) => c.name.trim());

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      // Call the batch add function on the contract with gasPrice
      await electionContract.methods
        .addCandidatesBatch(candidateIds, candidateNames)
        .send({
          from: currentAccount,
          gasPrice: gasPrice, // Add this line to fix EIP-1559 error
        });

      setSuccessMessage(
        `${validCandidates.length} candidates added successfully!`
      );
      setCandidateBatch([{ name: "" }]);

      // Refresh data after adding candidates
      await refreshData();
    } catch (err: any) {
      alert("Error adding candidates batch: " + err);
      setError(err.message || "Failed to add candidates");
    } finally {
      setLoading(false);
    }
  };

  // Start election
  const handleStartElection = async () => {
    if (!electionContract || !web3 || !currentAccount || !isOwner) return;
    if (electionState !== ElectionState.Preparing) {
      setError("Election can only be started from preparing state");
      return;
    }
    if (candidates.length === 0) {
      setError("Cannot start election with no candidates");
      return;
    }

    try {
      setLoading(true);

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      await electionContract.methods.startElection().send({
        from: currentAccount,
        gasPrice: gasPrice, // Add gasPrice to fix EIP-1559 error
      });

      setSuccessMessage("Election started successfully!");

      // Refresh data after starting election
      await refreshData();
    } catch (err: any) {
      alert("Error starting election: " + err);
      setError(err.message || "Failed to start election");
    } finally {
      setLoading(false);
    }
  };

  // End election
  const handleEndElection = async () => {
    if (!electionContract || !web3 || !currentAccount || !isOwner) return;
    if (electionState !== ElectionState.Active) {
      setError("Election is not active");
      return;
    }

    try {
      setLoading(true);

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      await electionContract.methods.endElection().send({
        from: currentAccount,
        gasPrice: gasPrice, // Add gasPrice to fix EIP-1559 error
      });

      setSuccessMessage("Election ended successfully!");

      // Refresh data after ending election
      await refreshData();
    } catch (err: any) {
      alert("Error ending election: " + err);
      setError(err.message || "Failed to end election");
    } finally {
      setLoading(false);
    }
  };

  // Create new election
  const handleCreateNewElection = async () => {
    if (!electionContract || !web3 || !currentAccount || !isOwner) return;
    if (electionState !== ElectionState.Ended) {
      setError("Can only create new election when previous election has ended");
      return;
    }

    try {
      setLoading(true);

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      await electionContract.methods.createNewElection().send({
        from: currentAccount,
        gasPrice: gasPrice, // Add gasPrice to fix EIP-1559 error
      });

      setSuccessMessage("New election created successfully!");

      // Refresh data after creating new election
      await refreshData();
    } catch (err: any) {
      alert("Error creating new election: " + err);
      setError(err.message || "Failed to create new election");
    } finally {
      setLoading(false);
    }
  };

  // Unverify user (admin only)
  const handleUnverifyUser = async () => {
    if (!verificationContract || !web3 || !currentAccount || !isOwner) return;
    if (!unverifyAddress) {
      setError("Address to unverify is required");
      return;
    }

    try {
      setLoading(true);

      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();

      await verificationContract.methods.unverifyUser(unverifyAddress).send({
        from: currentAccount,
        gasPrice: gasPrice, // Add gasPrice to fix EIP-1559 error
      });

      setSuccessMessage(`User ${unverifyAddress} unverified successfully!`);
      setUnverifyAddress("");

      // Refresh verification status if the current user was unverified
      if (unverifyAddress.toLowerCase() === currentAccount.toLowerCase()) {
        await refreshData();
      }
    } catch (err: any) {
      alert("Error unverifying user: " + err);
      setError(err.message || "Failed to unverify user");
    } finally {
      setLoading(false);
    }
  };

  // Clear messages after a delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch all past elections data on mount
  useEffect(() => {
    if (currentAccount && electionContract && electionCount > 0) {
      fetchAllPastElections();
    }
  }, [currentAccount, electionContract, electionCount]);

  // Function to fetch all past elections data
  const fetchAllPastElections = async () => {
    if (!electionContract) return;

    try {
      setLoading(true);

      // Create an array of promises to fetch all elections
      const fetchPromises = [];
      for (let id = 1; id <= electionCount; id++) {
        fetchPromises.push(fetchElectionById(id));
      }

      // Wait for all promises to resolve
      const electionsData = await Promise.all(fetchPromises);

      // Set all elections with first one selected by default (if any)
      const formattedElections = electionsData.map((election, index) => ({
        id: index + 1,
        candidates: election,
        selected: index === 0,
      }));

      setPastElections(formattedElections);
    } catch (err) {
      console.error("Error fetching past elections:", err);
      setError("Failed to fetch past elections");
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch a single election by ID
  const fetchElectionById = async (id: number) => {
    try {
      const results = await electionContract.methods
        .getPastElectionResults(id)
        .call();

      return results.map((r: any) => ({
        id: parseInt(r.id),
        name: r.name,
        voteCount: parseInt(r.voteCount),
      }));
    } catch (err) {
      console.error(`Error fetching election #${id}:`, err);
      return [];
    }
  };

  // Function to handle card selection
  const handleSelectElection = (id: number) => {
    setPastElections(
      pastElections.map((election) => ({
        ...election,
        selected: election.id === id,
      }))
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Blockchain Voting System</h1>
      </header>

      <main className="App-main">
        {loading && <div className="loader">Loading...</div>}

        {error && <div className="error-message">{error}</div>}
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        <section className="connection-status">
          <h2>Connection Status</h2>

          {!currentAccount ? (
            <div className="connect-wallet">
              <p className="info-message">
                Connect your MetaMask wallet to participate in the election.
              </p>
              <button
                className="connect-button"
                onClick={connectWallet}
                disabled={loading || !web3}
              >
                Connect MetaMask
              </button>
            </div>
          ) : (
            <>
              <div className="status-grid">
                <div>
                  <strong>Account:</strong>{" "}
                  {`${currentAccount.substring(
                    0,
                    6
                  )}...${currentAccount.substring(currentAccount.length - 4)}`}
                </div>
                <div className="status-with-button">
                  <div>
                    <strong>Status:</strong>{" "}
                    {isVerified ? "Verified Voter" : "Not Verified"}
                  </div>
                  {!isVerified && (
                    <button
                      className="verify-self-button"
                      onClick={handleSelfVerify}
                      title="Verify yourself"
                    >
                      Verify Self
                    </button>
                  )}
                </div>
                <div>
                  <strong>Role:</strong> {isOwner ? "Admin" : "Voter"}
                </div>
                <div>
                  <strong>Election State:</strong>{" "}
                  {electionState === ElectionState.Preparing
                    ? "Preparing"
                    : electionState === ElectionState.Active
                    ? "Active"
                    : "Ended"}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Voter Section */}
        {currentAccount && (
          <section className="voter-section">
            <h2>Current Election</h2>

            {electionState === ElectionState.Preparing && (
              <p className="info-message">
                The election is currently being prepared. Please wait for it to
                start.
              </p>
            )}

            {electionState === ElectionState.Ended && (
              <p className="info-message">
                This election has ended. Results are available in the Past
                Elections section.
              </p>
            )}

            {electionState === ElectionState.Active && (
              <>
                <h3>Cast Your Vote</h3>
                {!isVerified ? (
                  <p className="warning-message">
                    You need to be verified to vote. Please verify yourself
                    using the "Verify Self" button above.
                  </p>
                ) : hasVoted ? (
                  <p className="info-message">
                    You have already voted in this election.
                  </p>
                ) : (
                  <div className="voting-form">
                    <select
                      value={selectedCandidateId}
                      onChange={(e) => setSelectedCandidateId(e.target.value)}
                      disabled={loading || !isVerified || hasVoted}
                    >
                      <option value="">Select a candidate</option>
                      {candidates.map((candidate) => (
                        <option
                          key={candidate.id}
                          value={candidate.id.toString()}
                        >
                          {candidate.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={handleVote}
                      disabled={
                        loading ||
                        !isVerified ||
                        hasVoted ||
                        !selectedCandidateId
                      }
                    >
                      Cast Vote
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="candidates-list">
              <h3>
                Candidates{" "}
                {electionState === ElectionState.Active &&
                  currentLeader &&
                  `(Current Leader: ${currentLeader.name})`}
              </h3>
              {candidates.length === 0 ? (
                <p className="info-message">
                  No candidates have been added yet.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      {electionState !== ElectionState.Preparing && (
                        <th>Votes</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr
                        key={candidate.id}
                        className={
                          currentLeader && currentLeader.id === candidate.id
                            ? "leader"
                            : ""
                        }
                      >
                        <td>{candidate.id}</td>
                        <td>{candidate.name}</td>
                        {electionState !== ElectionState.Preparing && (
                          <td>{candidate.voteCount}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* Past Elections Section */}
        {currentAccount && (
          <section className="past-elections">
            <h2>Past Elections</h2>

            {electionCount > 0 ? (
              <>
                <div className="elections-card-container">
                  {Array.from({ length: electionCount }, (_, i) => i + 1).map(
                    (id) => (
                      <div
                        key={id}
                        className={`election-card ${
                          pastElections.find((e) => e.id === id)?.selected
                            ? "selected"
                            : ""
                        }`}
                        onClick={() => handleSelectElection(id)}
                      >
                        <h3>Election #{id}</h3>
                        <p>
                          {pastElections.find((e) => e.id === id)?.candidates
                            .length || 0}{" "}
                          Candidates
                        </p>
                      </div>
                    )
                  )}
                </div>

                {pastElections.find((e) => e.selected) ? (
                  <div className="past-results">
                    <h3>
                      Results for Election #
                      {pastElections.find((e) => e.selected)?.id}
                    </h3>
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Votes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastElections
                          .find((e) => e.selected)
                          ?.candidates.slice()
                          .sort((a, b) => b.voteCount - a.voteCount)
                          .map((candidate) => (
                            <tr key={candidate.id}>
                              <td>{candidate.id}</td>
                              <td>{candidate.name}</td>
                              <td>{candidate.voteCount}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="info-message">
                    Select an election to view results
                  </p>
                )}
              </>
            ) : (
              <p className="info-message">No past elections available.</p>
            )}
          </section>
        )}

        {/* Admin Panel */}
        {currentAccount && isOwner && (
          <section className="admin-panel">
            <h2>Admin Panel</h2>
            <p className="success-message">
              You are the contract owner and have administrative privileges
            </p>

            {/* Admin Verification Controls */}
            <div className="admin-section">
              <h3>Admin Voter Verification</h3>

              <div className="admin-form">
                <h4>Unverify User</h4>
                <input
                  type="text"
                  placeholder="User Address"
                  value={unverifyAddress}
                  onChange={(e) => setUnverifyAddress(e.target.value)}
                  disabled={loading}
                />
                <button
                  onClick={handleUnverifyUser}
                  disabled={loading || !unverifyAddress}
                >
                  Unverify User
                </button>
              </div>
            </div>

            {/* Election Management */}
            <div className="admin-section">
              <h3>Election Management</h3>

              {electionState === ElectionState.Preparing && (
                <>
                  <div className="admin-form batch-candidates-form">
                    <h4>Add Candidates in Batch</h4>
                    {candidateBatch.map((candidate, index) => (
                      <div key={index} className="candidate-input-row">
                        <input
                          type="text"
                          placeholder="Candidate Name"
                          value={candidate.name}
                          onChange={(e) =>
                            handleCandidateNameChange(index, e.target.value)
                          }
                          disabled={loading}
                        />
                        {candidateBatch.length > 1 && (
                          <button
                            className="remove-candidate-btn"
                            onClick={() => removeCandidateField(index)}
                            disabled={loading}
                            title="Remove candidate"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}

                    <div className="batch-buttons">
                      <button
                        className="add-candidate-field"
                        onClick={addCandidateField}
                        disabled={loading}
                      >
                        + Add Another Candidate
                      </button>

                      <button
                        className="submit-batch"
                        onClick={handleAddCandidatesBatch}
                        disabled={
                          loading ||
                          !candidateBatch.some((c) => c.name.trim() !== "")
                        }
                      >
                        Add All Candidates
                      </button>
                    </div>
                  </div>

                  <button
                    className="action-button"
                    onClick={handleStartElection}
                    disabled={loading || candidates.length === 0}
                  >
                    Start Election
                  </button>
                </>
              )}

              {electionState === ElectionState.Active && (
                <button
                  className="action-button"
                  onClick={handleEndElection}
                  disabled={loading}
                >
                  End Election
                </button>
              )}

              {electionState === ElectionState.Ended && (
                <button
                  className="action-button"
                  onClick={handleCreateNewElection}
                  disabled={loading}
                >
                  Create New Election
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
