// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

contract ManagedTokenDistributor {
    address public immutable tokenOut;
    uint256 public immutable amount;
    address public immutable recipient;
    address public immutable owner;
    bool public executed;

    event Executed(address indexed token, uint256 amount, address indexed recipient);
    event TokensRescued(address indexed token, uint256 amount, address indexed to);

    error OnlyOwner();
    error AlreadyExecuted();
    error TransferFailed();
    error InsufficientBalance(uint256 available, uint256 required);

    constructor(
        address _tokenOut,
        uint256 _amount,
        address _recipient,
        address _owner
    ) {
        require(_tokenOut != address(0), "Invalid token address");
        require(_amount > 0, "Amount must be greater than 0");
        require(_recipient != address(0), "Invalid recipient address");
        require(_owner != address(0), "Invalid owner address");

        tokenOut = _tokenOut;
        amount = _amount;
        recipient = _recipient;
        owner = _owner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    function execute() external onlyOwner {
        if (executed) revert AlreadyExecuted();

        uint256 balance = IERC20Minimal(tokenOut).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance(balance, amount);

        executed = true;
        if (!IERC20Minimal(tokenOut).transfer(recipient, amount)) revert TransferFailed();

        emit Executed(tokenOut, amount, recipient);
    }

    function rescueTokens(address token) external onlyOwner {
        uint256 balance = IERC20Minimal(token).balanceOf(address(this));
        require(balance > 0, "No tokens to rescue");

        if (!IERC20Minimal(token).transfer(owner, balance)) revert TransferFailed();

        emit TokensRescued(token, balance, owner);
    }

    function getConfig()
        external
        view
        returns (
            address _tokenOut,
            uint256 _amount,
            address _recipient,
            address _owner,
            bool _executed
        )
    {
        return (tokenOut, amount, recipient, owner, executed);
    }
}
